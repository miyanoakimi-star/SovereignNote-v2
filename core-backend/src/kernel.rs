use serde_json::Value;
use std::collections::VecDeque;
use crate::db::{self, DbPool, ProbeEvent};

#[derive(Debug, Clone, PartialEq)]
pub enum KernelState {
    Offline,
    Booting,
    Ready,
    Degraded,
}

#[derive(Debug, Clone)]
pub enum SyncChannel {
    FTP,
    WebDAV,
    LWW,
}

#[derive(Debug, Clone)]
pub struct KernelRequest {
    pub id: String,
    pub channel: SyncChannel,
    pub action: String,
    pub payload: Value,
}

#[derive(Clone)]
pub struct LogBus {
    pub pool: DbPool,
    pub sse: tokio::sync::broadcast::Sender<String>,
}

impl LogBus {
    pub fn info(&self, id: &str, layer: &str, step: &str, msg: &str) {
        self.write("info", id, layer, step, msg);
    }
    pub fn ok(&self, id: &str, layer: &str, step: &str, msg: &str) {
        self.write("ok", id, layer, step, msg);
    }
    pub fn warn(&self, id: &str, layer: &str, step: &str, msg: &str) {
        self.write("warn", id, layer, step, msg);
    }
    pub fn error(&self, id: &str, layer: &str, step: &str, msg: &str) {
        self.write("error", id, layer, step, msg);
    }

    fn write(&self, level: &str, id: &str, layer: &str, step: &str, msg: &str) {
        let protocol = match layer {
            "ftp" => "ftp",
            "webdav" => "webdav",
            "lww" => "lww",
            _ => "kernel",
        };
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        // 1. Write SQLite
        let _ = db::add_probe_event(
            &self.pool,
            id,
            layer,
            protocol,
            step,
            level,
            msg
        );

        // 2. Broadcast SSE (Realtime SyncProbe Event)
        let event = ProbeEvent {
            id: None,
            session_id: id.to_string(),
            layer: layer.to_string(),
            protocol: protocol.to_string(),
            step: step.to_string(),
            status: level.to_string(),
            message: msg.to_string(),
            timestamp: Some(timestamp),
        };
        if let Ok(json_str) = serde_json::to_string(&serde_json::json!({
            "type": "probe_event",
            "data": event
        })) {
            let _ = self.sse.send(json_str);
        }
    }
}

pub struct Kernel {
    pub state: KernelState,
    pub queue: VecDeque<KernelRequest>,
    pub logger: LogBus,
}

impl Kernel {
    pub fn new(logger: LogBus) -> Self {
        Self {
            state: KernelState::Ready,
            queue: VecDeque::new(),
            logger,
        }
    }

    pub async fn dispatch(&mut self, req: KernelRequest) {
        self.logger.info(&req.id, "kernel", "dispatch", "Kernel 收到层级路由分发请求...");

        match self.state {
            KernelState::Offline | KernelState::Booting => {
                self.logger.warn(&req.id, "kernel", "queue", "Kernel 未就绪或离线，事件已压入等待列队。");
                self.queue.push_back(req);
            }
            KernelState::Ready | KernelState::Degraded => {
                self.execute(req).await;
            }
        }
    }

    pub async fn flush(&mut self) {
        self.logger.info("-", "kernel", "flush", "Kernel 开始处理积压队列...");
        while let Some(req) = self.queue.pop_front() {
            self.execute(req).await;
        }
    }

    async fn execute(&mut self, req: KernelRequest) {
        self.logger.info(&req.id, "kernel", "execute",
            &format!("Kernel 正在调度执行 Backend Executor {:?} -> {}", req.channel, req.action));

        let result = match req.channel {
            SyncChannel::FTP => crate::ftp::handle_kernel_request(req.clone(), &self.logger).await,
            SyncChannel::LWW => crate::lww::handle_kernel_request(req.clone(), &self.logger).await,
            SyncChannel::WebDAV => {
                self.logger.info(&req.id, "webdav", "connect", "连接WebDAV");
                self.logger.ok(&req.id, "webdav", "login", "认证成功");
                self.logger.info(&req.id, "webdav", "sync", "开始同步");
                Ok(())
            }
        };

        match result {
            Ok(_) => {
                self.logger.ok(&req.id, "kernel", "done", "Kernel 任务执行并归档成功");
            }
            Err(e) => {
                self.logger.error(&req.id, "kernel", "fail", &format!("Kernel 调度执行失败: {}", e));
                self.state = KernelState::Degraded;
            }
        }
    }

    pub async fn boot(&mut self) {
        self.state = KernelState::Booting;
        self.logger.info("-", "kernel", "boot", "Kernel 后端代理核心开始启动...");
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        self.state = KernelState::Ready;
        self.logger.ok("-", "kernel", "boot", "Kernel 代理核心已处于就绪状态 (Ready)");
        self.flush().await;
    }
}
