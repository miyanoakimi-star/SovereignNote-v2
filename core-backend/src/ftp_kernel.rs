use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::timeout;
// 引入 futures-util 核心 Trait，用于开启类型擦除的 .boxed() 零成本限制
use futures_util::future::BoxFuture;
use futures_util::FutureExt;

// =====================================================================
// 1. 状态与事件系统定义 (State & Event System)
// =====================================================================

/// FTP 执行状态机明确的离散阶段
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum FtpStage {
    Connect,
    Login,
    List,
    Cwd,
    Quit,
}

/// 生产级多端通用事件载荷 (UI 实时状态流 + Journal 日志持久化双向兼容)
#[derive(Debug, Clone, Serialize)]
pub struct KernelEvent {
    pub task_id: String,
    pub stage: FtpStage,
    /// 状态标识: "stage_start", "stage_ok", "stage_retry", "stage_failed", "timeout_failed"
    pub status: &'static str,
    pub message: String,
    /// 采用标准 Unix 绝对时间戳（秒），规避相对时间跨端恢复失效与时钟回拨 Panic 隐患
    pub unix_timestamp: u64,
}

// =====================================================================
// 2. 阶段看门狗配置策略 (Policy Configuration)
// =====================================================================

#[derive(Debug, Clone)]
pub struct StageConfig {
    pub timeout: Duration,
    pub retry: u32,
}

/// 专为老旧 Android 遗留硬件（如诺基亚 N1）与局域网网络抖动优化的默认策略表
pub fn default_stage_config() -> HashMap<FtpStage, StageConfig> {
    use FtpStage::*;
    HashMap::from([
        (Connect, StageConfig { timeout: Duration::from_secs(10), retry: 2 }), // 连接容忍 10s，重试 2 次
        (Login,   StageConfig { timeout: Duration::from_secs(10), retry: 2 }), // 登录容忍 10s（老安卓核心延迟点），重试 2 次
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
    /// 事件发射通道，直连 Kernel Router 管道分发至前端 (Capacitor WebView)
    event_tx: mpsc::Sender<KernelEvent>,
    /// 阶段策略配置
    config: HashMap<FtpStage, StageConfig>,
    // 💡 架构师提示：此处后续可无缝挂载你的独占套接字或会话资产，例如：
    // pub socket: Option<tokio::net::TcpStream>,
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

    /// 统一的高可观测性软心跳事件发射器
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

        // 采用非阻塞发射，若外部路由分发通道关闭则静默忽略，防止反向污染内核
        let _ = self.event_tx.send(event).await;
    }

    /// 核心重构：基于命令派发的原子阶段执行器
    /// 彻底剪除了异步闭包，配合 `BoxFuture<'_, ...>` 保证 `&mut self` 在 loop 中拥有绝对安全的生命周期
    async fn execute_stage(&mut self, stage: FtpStage) -> Result<(), String> {
        let (stage_timeout, stage_retry) = {
            let cfg = self.config.get(&stage).ok_or_else(|| "Stage config missing".to_string())?;
            (cfg.timeout, cfg.retry)
        };
        let mut attempts = 0;

        self.emit(stage, "stage_start", &format!("Initiating protocol phase: {:?}", stage)).await;

        loop {
            attempts += 1;

            // =====================================================================
            // 🔥 关键修正：利用 BoxFuture<'_, Result<...>> 替代 BoxFuture<'static, ...>
            // '_ 显式告知借用检查器：被抹平的具体 Future 允许持有对 `self` 内部物理资产的独占可变借用
            // =====================================================================
            let io_future: BoxFuture<'_, Result<(), String>> = match stage {
                FtpStage::Connect => self.impl_connect().boxed(),
                FtpStage::Login   => self.impl_login().boxed(),
                FtpStage::List    => self.impl_list().boxed(),
                FtpStage::Cwd     => self.impl_cwd().boxed(),
                FtpStage::Quit    => self.impl_quit().boxed(),
            };

            // 精准实施局部单阶段超时控制，杜绝全局 Watchdog 误杀
            match timeout(stage_timeout, io_future).await {
                // 情况一：I/O 在预算内完成且协议执行成功
                Ok(Ok(_)) => {
                    self.emit(stage, "stage_ok", "Phase completed successfully.").await;
                    return Ok(());
                }
                // 情况二：I/O 未超时，但底层网络或协议报错（如密码错、握手断开、404 HTML 意外报文）
                Ok(Err(err_msg)) => {
                    if attempts > stage_retry {
                        self.emit(stage, "stage_failed", &format!("Aborted. Exceeded max retries. Error: {}", err_msg)).await;
                        return Err(err_msg);
                    }
                    self.emit(stage, "stage_retry", &format!("Attempt {} failed: {}. Retrying...", attempts, err_msg)).await;
                }
                // 情况三：I/O 彻底超时（局部看门狗平滑拦截）
                Err(_) => {
                    if attempts > stage_retry {
                        self.emit(stage, "timeout_failed", "Aborted. Critical timeout restriction triggered.").await;
                        return Err(format!("Phase {:?} timed out permanently.", stage));
                    }
                    self.emit(stage, "stage_retry", &format!("Attempt {} timed out. Re-triggering...", attempts)).await;
                }
            }

            // 💡 针对老旧 Android 5.1.1 强力注入的 200ms 抖动退避机制 (Jitter Buffer)
            // 当 Future 被丢弃释放后挂起 200ms，给予网卡驱动、Looper 队列以及路由器状态机充分的恢复缓冲时间
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }

    // =====================================================================
    // 4. 底层硬核异步网络 I/O 业务管道 (真实业务逻辑挂载点)
    // =====================================================================

    async fn impl_connect(&mut self) -> Result<(), String> {
        // 在此处对接真正的套接字建立逻辑: TcpStream::connect
        tokio::time::sleep(Duration::from_millis(774)).await; // 完美对齐真机日志损耗
        Ok(())
    }

    async fn impl_login(&mut self) -> Result<(), String> {
        // 在此处对接真正的 USER -> PASS 状态机报文流交互
        tokio::time::sleep(Duration::from_millis(1876)).await; // 完美对齐真机日志损耗
        Ok(())
    }

    async fn impl_list(&mut self) -> Result<(), String> {
        // 在此处对接 PASV 模式切换与数据通道读取
        tokio::time::sleep(Duration::from_millis(226)).await;
        Ok(())
    }

    async fn impl_cwd(&mut self) -> Result<(), String> {
        // 切换远程主权节点工作目录
        tokio::time::sleep(Duration::from_millis(74)).await;
        Ok(())
    }

    async fn impl_quit(&mut self) -> Result<(), String> {
        // 发送 QUIT 报文干净利落地注销会话
        tokio::time::sleep(Duration::from_millis(441)).await;
        Ok(())
    }

    // =====================================================================
    // 5. 全局编排总线入口 (Global Orchestrator)
    // =====================================================================

    /// 启动 Actor 执行引擎主流程
    pub async fn execute_system_flow(&mut self) -> Result<(), String> {
        // 确定性的顺序流转拓扑，任何阶段发生不可恢复的致命失败，通过 ? 快速熔断并回传给主内核
        self.execute_stage(FtpStage::Connect).await?;
        self.execute_stage(FtpStage::Login).await?;
        self.execute_stage(FtpStage::List).await?;
        self.execute_stage(FtpStage::Cwd).await?;
        self.execute_stage(FtpStage::Quit).await?;

        Ok(())
    }
}
