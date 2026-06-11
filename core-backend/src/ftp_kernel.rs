use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::timeout;

// =====================================================================
// 1. 状态与事件定义 (State & Event System)
// =====================================================================

/// FTP 执行状态机阶段（明确的离散状态）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum FtpStage {
    Connect,
    Login,
    List,
    Cwd,
    Quit,
}

/// 生产级多端事件载荷 (UI 实时状态流 + Journal 日志持久化双兼容)
#[derive(Debug, Clone, Serialize)]
pub struct KernelEvent {
    pub task_id: String,
    pub stage: FtpStage,
    /// 状态标识: "stage_start", "stage_ok", "stage_retry", "stage_failed", "timeout_failed"
    pub status: &'static str, 
    pub message: String,
    /// 修复点：采用标准 Unix 绝对时间戳（秒），规避 Instant 相对时间无法跨进程重放与时钟回拨 Panic 隐患
    pub unix_timestamp: u64,
}

// =====================================================================
// 2. 阶段配置策略 (Policy Configuration)
// =====================================================================

#[derive(Debug, Clone)]
pub struct StageConfig {
    pub timeout: Duration,
    pub retry: u32,
}

/// 针对 Android 5.1.1 遗留硬件与局域网网络抖动优化的默认策略表
pub fn default_stage_config() -> HashMap<FtpStage, StageConfig> {
    use FtpStage::*;
    HashMap::from([
        (Connect, StageConfig { timeout: Duration::from_secs(10), retry: 2 }), // 连接容忍 10s，重试 2 次
        (Login,   StageConfig { timeout: Duration::from_secs(10), retry: 2 }), // 登录容忍 10s（老安卓核心卡点），重试 2 次
        (List,    StageConfig { timeout: Duration::from_secs(5),  retry: 1 }), // PASV 纵向列取容忍 5s
        (Cwd,     StageConfig { timeout: Duration::from_secs(5),  retry: 1 }), 
        (Quit,    StageConfig { timeout: Duration::from_secs(3),  retry: 0 }), // 正常退出不进行重试
    ])
}

// =====================================================================
// 3. 核心 Actor 引擎实现 (Execution Engine)
// =====================================================================

pub struct FtpActor {
    task_id: String,
    /// 事件发射通道，直连 Kernel Router 管道分发至前端 (Capacitor)
    event_tx: mpsc::Sender<KernelEvent>,
    /// 阶段策略配置
    config: HashMap<FtpStage, StageConfig>,
    // 💡 提示：此处后续可无缝挂载你的独占套接字或会话资产，如：
    // stream: Option<tokio::net::TcpStream>,
}

impl FtpActor {
    /// 构造函数
    pub fn new(task_id: String, event_tx: mpsc::Sender<KernelEvent>) -> Self {
        Self {
            task_id,
            event_tx,
            config: default_stage_config(),
        }
    }

    /// 统一的高可观测性事件发射器
    async fn emit(&self, stage: FtpStage, status: &'static str, msg: &str) {
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let event = KernelEvent {
            task_id: self.task_id.clone(),
            stage,
            status,
            message: msg.to_string(),
            unix_timestamp: current_time,
        };

        // 采用不阻塞主执行流的发射方式，若路由通道关闭则静默忽略
        let _ = self.event_tx.send(event).await;
    }

    /// 核心升级：基于命令派发（Match Dispatcher）的原子阶段执行器
    /// 彻底剪除了异步闭包（Fn() -> Fut），确保 &mut self 在 loop 重试中拥有绝对安全的借用生命周期
    async fn execute_stage(&mut self, stage: FtpStage) -> Result<(), String> {
        let cfg = self.config.get(&stage).ok_or_else(|| "Stage config missing".to_string())?;
        let mut attempts = 0;

        self.emit(stage, "stage_start", &format!("Initiating protocol phase: {:?}", stage)).await;

        loop {
            attempts += 1;

            // 依据单体 Owner 状态机状态，动态生成真正的底层异步网络 I/O Future
            let io_future = match stage {
                FtpStage::Connect => self.impl_connect(),
                FtpStage::Login   => self.impl_login(),
                FtpStage::List    => self.impl_list(),
                FtpStage::Cwd     => self.impl_cwd(),
                FtpStage::Quit    => self.impl_quit(),
            };

            // 精准实施单阶段超时控制
            match timeout(cfg.timeout, io_future).await {
                // 情况一：I/O 在规定时间内完成且执行成功
                Ok(Ok(_)) => {
                    self.emit(stage, "stage_ok", "Phase completed successfully.").await;
                    return Ok(());
                }
                // 情况二：I/O 在时间内返回，但底层协议或网络报错（如密码错、握手断开）
                Ok(Err(err_msg)) => {
                    if attempts > cfg.retry {
                        self.emit(stage, "stage_failed", &format!("Aborted. Exceeded max retries. Error: {}", err_msg)).await;
                        return Err(err_msg);
                    }
                    self.emit(stage, "stage_retry", &format!("Attempt {} failed: {}. Retrying...", attempts, err_msg)).await;
                }
                // 情况三：I/O 彻底超时（Watchdog 局部介入，未破坏系统长周期）
                Err(_) => {
                    if attempts > cfg.retry {
                        self.emit(stage, "timeout_failed", "Aborted. Execution step timed out under policy restriction.").await;
                        return Err(format!("Phase {:?} timed out permanently.", stage));
                    }
                    self.emit(stage, "stage_retry", &format!("Attempt {} timed out. Re-triggering...", attempts)).await;
                }
            }

            // 💡 关键修复：专为老旧 Android 5.1.1 注入的 200ms 抖动退避机制 (Jitter Buffer)
            // 避免弱网或物理网卡Looper积压时，高频盲目重试导致连续失败
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }

    // =====================================================================
    // 4. 底层硬核异步网络 I/O 业务管道 (真实业务逻辑挂载点)
    // =====================================================================

    async fn impl_connect(&mut self) -> Result<(), String> {
        // 此处对接真正的 TcpStream::connect
        tokio::time::sleep(Duration::from_millis(774)).await; // 真实对齐你日志中的 774ms 消耗
        Ok(())
    }

    async fn impl_login(&mut self) -> Result<(), String> {
        // 此处对接真实的 USER/PASS 状态机交互
        tokio::time::sleep(Duration::from_millis(1876)).await; // 真实对齐你日志中的 1.87s 消耗
        Ok(())
    }

    async fn impl_list(&mut self) -> Result<(), String> {
        // 此处对接 PASV/EPSV 模式切换与数据通道读取
        tokio::time::sleep(Duration::from_millis(226)).await;
        Ok(())
    }

    async fn impl_cwd(&mut self) -> Result<(), String> {
        // 切换工作目录
        tokio::time::sleep(Duration::from_millis(74)).await;
        Ok(())
    }

    async fn impl_quit(&mut self) -> Result<(), String> {
        // 发送 QUIT 报文干净利落地关闭
        tokio::time::sleep(Duration::from_millis(441)).await;
        Ok(())
    }

    // =====================================================================
    // 5. 全局编排总线入口 (Global Orchestrator)
    // =====================================================================

    /// 启动 Actor 执行引擎主流程
    pub async fn execute_system_flow(&mut self) -> Result<(), String> {
        // 确定性的顺序流转拓扑，任何阶段发生不可恢复的致命失败，通过 ? 快速熔断并回传
        self.execute_stage(FtpStage::Connect).await?;
        self.execute_stage(FtpStage::Login).await?;
        self.execute_stage(FtpStage::List).await?;
        self.execute_stage(FtpStage::Cwd).await?;
        self.execute_stage(FtpStage::Quit).await?;
        
        Ok(())
    }
}
