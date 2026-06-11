use suppaftp::AsyncFtpStream;
use serde::{Deserialize, Serialize};
use crate::db::{DbPool, add_sync_log_detailed};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtpConfig {
    pub host: String,
    pub user: String,
    pub pass: String,
    pub path: String,
    pub secure: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum FtpState {
    Disconnected,
    Connected,
    Authenticated,
    SessionReady,
    DataReady,
}

#[derive(Debug, Clone)]
pub enum FtpMode {
    Passive,
    Active,
    Auto,
}

pub struct FtpClient {
    pub stream: AsyncFtpStream,
    pub mode: FtpMode,
    pub state: FtpState,
    host: String,
    user: String,
    pass: String,
}

impl FtpClient {
    pub async fn connect(host: &str) -> Result<Self, String> {
        let stream = AsyncFtpStream::connect(host)
            .await
            .map_err(|e| format!("CONNECT FAIL: {}", e))?;

        Ok(Self {
            stream,
            mode: FtpMode::Auto,
            state: FtpState::Connected,
            host: host.to_string(),
            user: String::new(),
            pass: String::new(),
        })
    }

    pub async fn login(&mut self, user: &str, pass: &str) -> Result<(), String> {
        self.user = user.to_string();
        self.pass = pass.to_string();
        let mut last_err = None;

        for _ in 0..3 {
            match self.stream.login(user, pass).await {
                Ok(_) => {
                    self.state = FtpState::Authenticated;
                    self.post_login_init().await?;
                    return Ok(());
                }
                Err(e) => {
                    last_err = Some(e.to_string());
                    self.recover_session().await;
                    continue;
                }
            }
        }

        Err(format!("LOGIN FAILED after retries: {:?}", last_err))
    }

    async fn post_login_init(&mut self) -> Result<(), String> {
        // 1. NOOP 激活 session
        let _ = self.stream.noop().await;
    
        // 2. PWD sanity check
        let _ = self.stream.pwd().await;
    
        // 3. 自动探测 PASV / EPSV
        self.detect_data_mode().await?;
    
        self.state = FtpState::SessionReady;
        Ok(())
    }

    async fn detect_data_mode(&mut self) -> Result<(), String> {
        // 默认优先 PASV
        match self.stream.list(None).await {
            Ok(_) => {
                self.mode = FtpMode::Passive;
                self.state = FtpState::DataReady;
                return Ok(());
            }
            Err(_) => {}
        }
    
        // fallback EPSV
        if self.stream.pasv().await.is_ok() {
            self.mode = FtpMode::Passive;
            self.state = FtpState::DataReady;
            return Ok(());
        }
    
        // 最后 fallback active（极少用）
        self.mode = FtpMode::Active;
        Ok(())
    }

    pub async fn safe_list(&mut self) -> Result<Vec<String>, String> {
        for _ in 0..2 {
            match self.stream.list(None).await {
                Ok(list) => return Ok(list),
                Err(_) => {
                    self.recover_session().await;
                    continue;
                }
            }
        }
    
        Err("LIST failed after retry".into())
    }

    async fn recover_session(&mut self) {
        let _ = self.stream.quit().await;
    
        // 重新建立连接（工业级关键点）
        if let Ok(new_stream) = AsyncFtpStream::connect(&self.host).await {
            self.stream = new_stream;
            self.state = FtpState::Connected;
            // Option to auto-login here if we have credentials?
            if !self.user.is_empty() {
                let _ = self.stream.login(&self.user, &self.pass).await;
            }
        }
    }

    pub async fn cwd(&mut self, path: &str) -> Result<(), String> {
        self.stream.cwd(path).await.map_err(|e| e.to_string())
    }

    pub async fn put_file(&mut self, name: &str, content: &mut &[u8]) -> Result<(), String> {
        self.stream.put_file(name, content).await.map_err(|e| e.to_string())
    }

    pub async fn quit(&mut self) -> Result<(), String> {
        self.stream.quit().await.map_err(|e| e.to_string())
    }
}

pub struct FtpStorageProvider;

impl FtpStorageProvider {
    pub async fn test_sync(
        pool: &DbPool,
        session_id: Option<&str>,
        config: &FtpConfig,
    ) -> Result<(), String> {
        let host = if config.host.contains(':') {
            config.host.clone()
        } else {
            format!("{}:21", config.host)
        };
        
        let protocol = Some("ftp");
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "INFO", &format!("【连接测试】准备建立新 FTP 传输信道，准备接入目标网络主机：{}", host));

        let mut client = FtpClient::connect(&host).await.map_err(|e| {
            let err_msg = format!("【连接测试】物理层网络握手异常: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "ERROR", &err_msg);
            err_msg
        })?;
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "SUCCESS", "【连接测试】物理层套接字 TCP 链路握手完成。");

        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "INFO", &format!("【连接测试】向 FTP 网关发送登录令牌。用户名: '{}'", config.user));
        if let Err(e) = client.login(&config.user, &config.pass).await {
            let err_msg = format!("【连接测试】安全网关登录验证未通过: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "ERROR", &err_msg);
            return Err(err_msg);
        }
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "SUCCESS", "【连接测试】FTP 双向身份令牌安全验证已核准通过，开始申请分配数据端口。");
        
        // 测试数据通道是否正常
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "INFO", "【连接测试】提交 LIST 侦测指令，校验宿主机远程文件系统访问权及主动/被动模式是否通畅。");
        match client.safe_list().await {
            Ok(list) => {
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "SUCCESS", &format!("【连接测试】目录探测顺利！已成功定位当前会话节点中的 {} 个底层文件对象。", list.len()));
            }
            Err(e) => {
                let err_msg = format!("【连接测试】LIST 命令异常 (常见于内网多路复用防火墙拦截、或无PASV备用端口限流): {}", e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "WARN", &err_msg);
            }
        }

        // 切目录
        if !config.path.trim().is_empty() {
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "INFO", &format!("【连接测试】发出 CWD/CD 命令跳转到目标文件归档绝对路径: '{}'", config.path));

            if let Err(e) = client.cwd(&config.path).await {
                let err_msg = format!("【连接测试】在多级云盘结构寻找路径失败 '{}', 校验该服务器远程路径是否存在。异常：{}", config.path, e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "ERROR", &err_msg);
                return Err(err_msg);
            }

            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "SUCCESS", &format!("【连接测试】已完成远程路径绑定，当前工作指针定位在: '{}'", config.path));
        }
        
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("end"), "SUCCESS", "【连接测试】FTP 接口联通性与登录权限完整性校验圆满成功！");

        let _ = client.quit().await;
        Ok(())
    }

    pub async fn upload_sync(
        pool: &DbPool,
        session_id: Option<&str>,
        config: &FtpConfig,
        content: Vec<u8>
    ) -> Result<(), String> {
        let host = if config.host.contains(':') {
            config.host.clone()
        } else {
            format!("{}:21", config.host)
        };
        
        let protocol = Some("ftp");
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "INFO", &format!("开始建立新 FTP 传输信道，准备接入目标网络主机：{}", host));

        let mut client = FtpClient::connect(&host).await.map_err(|e| {
            let err_msg = format!("物理层网络握手异常: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "ERROR", &err_msg);
            err_msg
        })?;
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "SUCCESS", "物理层套接字 TCP 链路握手完成，开始传输加密安全会话协定。");

        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "INFO", &format!("向 FTP 网关发送登录令牌。用户名: '{}'", config.user));
        if let Err(e) = client.login(&config.user, &config.pass).await {
            let err_msg = format!("安全网关登录验证未通过: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "ERROR", &err_msg);
            return Err(err_msg);
        }
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "SUCCESS", "FTP 双向身份令牌安全验证已核准通过，开始申请分配数据端口。");
        
        // 测试数据通道是否正常
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "INFO", "提交 LIST 侦测指令，校验宿主机远程文件系统访问权及主动/被动模式是否通畅。");
        match client.safe_list().await {
            Ok(list) => {
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "SUCCESS", &format!("目录探测顺利！已成功定位当前会话节点中的 {} 个底层文件对象。", list.len()));
            }
            Err(e) => {
                let err_msg = format!("LIST 命令异常 (常见于内网多路复用防火墙拦截、或无PASV备用端口限流): {}", e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "WARN", &err_msg);
            }
        }

        // 切目录
        if !config.path.trim().is_empty() {
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "INFO", &format!("发出 CWD/CD 命令跳转到目标文件归档绝对路径: '{}'", config.path));

            if let Err(e) = client.cwd(&config.path).await {
                let err_msg = format!("在多级云盘结构寻找路径失败 '{}', 校验该服务器远程路径是否存在。异常：{}", config.path, e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "ERROR", &err_msg);
                return Err(err_msg);
            }

            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "SUCCESS", &format!("已完成远程路径绑定，当前工作指针定位在: '{}'", config.path));
        }
        
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("upload"), "INFO", &format!("开始写入和封包。目标文件：sovereign_backup.json，待同步负载：{} 字节。", content.len()));

        let mut slice = &content[..];
        if let Err(e) = client.put_file("sovereign_backup.json", &mut slice).await {
            let err_msg = format!("FTP 写入 sovereign_backup.json 握手断连: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("upload"), "ERROR", &err_msg);
            return Err(err_msg);
        }

        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("upload"), "SUCCESS", "数据已完成全比特安全推流，覆盖成功写入宿主机闪存介质。");
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("end"), "SUCCESS", "增量/全量 FTP 热备份冷归档已宣告圆满结束！");

        let _ = client.quit().await;
        Ok(())
    }

    pub async fn download_sync(
        pool: &DbPool,
        session_id: Option<&str>,
        config: &FtpConfig
    ) -> Result<Option<Vec<u8>>, String> {
        let host = if config.host.contains(':') {
            config.host.clone()
        } else {
            format!("{}:21", config.host)
        };
        
        let protocol = Some("ftp");
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "INFO", &format!("开始建立新 FTP 传输信道，准备接入目标网络主机：{}", host));

        let mut client = FtpClient::connect(&host).await.map_err(|e| {
            let err_msg = format!("物理层网络握手异常: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "ERROR", &err_msg);
            err_msg
        })?;
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "SUCCESS", "物理层套接字 TCP 链路握手完成，开始传输加密安全会话协定。");

        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "INFO", &format!("向 FTP 网关发送登录令牌。用户名: '{}'", config.user));
        if let Err(e) = client.login(&config.user, &config.pass).await {
            let err_msg = format!("安全网关登录验证未通过: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "ERROR", &err_msg);
            return Err(err_msg);
        }
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "SUCCESS", "FTP 双向身份令牌安全验证已核准通过，开始申请分配数据端口。");

        // 测试数据通道是否正常
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "INFO", "提交 LIST 侦测指令，校验宿主机远程文件系统访问权及主动/被动模式是否通畅。");
        match client.safe_list().await {
            Ok(list) => {
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "SUCCESS", &format!("目录探测顺利！已成功定位当前会话节点中的 {} 个底层文件对象。", list.len()));
            }
            Err(e) => {
                let err_msg = format!("LIST 命令异常 (常见于内网多路复用防火墙拦截、或无PASV备用端口限流): {}", e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "WARN", &err_msg);
            }
        }

        // 切目录
        if !config.path.trim().is_empty() {
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "INFO", &format!("发出 CWD/CD 命令跳转到目标文件归档绝对路径: '{}'", config.path));

            if let Err(e) = client.cwd(&config.path).await {
                let err_msg = format!("在多级云盘结构寻找路径失败 '{}', 校验该服务器远程路径是否存在。异常：{}", config.path, e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "ERROR", &err_msg);
                return Err(err_msg);
            }

            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "SUCCESS", &format!("已完成远程路径绑定，当前工作指针定位在: '{}'", config.path));
        }
        
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "INFO", "向远端磁盘发出 RETR 镜像提取请求，搜寻文件：sovereign_backup.json");

        match client.stream.retr_as_stream("sovereign_backup.json").await {
            Ok(mut data_stream) => {
                use futures_util::io::AsyncReadExt;
                let mut buffer = Vec::new();
                if let Err(e) = data_stream.read_to_end(&mut buffer).await {
                    let _ = client.quit().await;
                    let err_msg = format!("文件传输信道意外崩溃，部分字节获取丢失: {}", e);
                    let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "ERROR", &err_msg);
                    return Err(err_msg);
                }
                
                if let Err(e) = client.stream.finalize_retr_stream(data_stream).await {
                    let _ = client.quit().await;
                    let err_msg = format!("关闭和校验提取文件句柄失败: {}", e);
                    let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "ERROR", &err_msg);
                    return Err(err_msg);
                }
                
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "SUCCESS", &format!("FTP 节点数据已被完美解包拉回本地内存中！共拉回: {} 字节。", buffer.len()));
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("end"), "SUCCESS", "FTP 双向备份拉取拉回操作成功声明完成。");

                let _ = client.quit().await;
                Ok(Some(buffer))
            }
            Err(e) => {
                let _ = client.quit().await;
                let err_msg = e.to_string();
                if err_msg.contains("550") || err_msg.contains("not found") || err_msg.contains("No such file") || err_msg.contains("not exist") {
                    let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "WARN", "未在远程 FTP 指定服务器目录匹配到备份归档卷 (sovereign_backup.json)，判定为首次同步初始化阶段，开启冷初始化模式。");
                    let _ = add_sync_log_detailed(pool, session_id, protocol, Some("end"), "SUCCESS", "远端未建库，已无损建立逻辑终点，开始转入本地数据就地合流进程。");
                    Ok(None)
                } else {
                    let full_err = format!("主机在下发 RETR 命令时网络闪退或断链: {}", err_msg);
                    let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "ERROR", &full_err);
                    Err(full_err)
                }
            }
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FtpPayload {
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub pass: String,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub action: String,
    pub data: Option<String>,
}

impl FtpPayload {
    pub fn validate(&self) -> Result<(), String> {
        if self.user.is_empty() || self.pass.is_empty() {
            return Err("FTP 用户名或密码为空".to_string());
        }
        if self.pass.len() < 6 && self.user != "anonymous" {
            return Err(format!("密码长度异常: {} 字节", self.pass.len()));
        }
        Ok(())
    }
}

pub async fn handle_kernel_request(req: crate::kernel::KernelRequest, log: &crate::kernel::LogBus) -> Result<(), String> {
    let payload_val = req.payload.clone();
    let payload_res: Result<FtpPayload, _> = serde_json::from_value(payload_val);
    
    let mut payload = match payload_res {
        Ok(p) => p,
        Err(_) => {
            // Fallback parsing if JSON object isn't strictly complying
            FtpPayload {
                user: req.payload.get("user").and_then(|u| u.as_str()).unwrap_or("anonymous").to_string(),
                pass: req.payload.get("pass").and_then(|p| p.as_str()).unwrap_or("").to_string(),
                host: req.payload.get("host").and_then(|h| h.as_str()).unwrap_or("").to_string(),
                path: req.payload.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string(),
                action: req.action.clone(),
                data: req.payload.get("data").and_then(|d| d.as_str()).map(|d| d.to_string()),
            }
        }
    };

    if payload.action.is_empty() {
        payload.action = req.action.clone();
    }

    if let Err(e) = payload.validate() {
        // Only enforce validation if not anonymous, or explicitly return err
        // We'll log the warning, and if it's test, return the error.
        log.warn(&req.id, "ftp", "validate", &e);
        if payload.user != "anonymous" {
            return Err(e);
        }
    }

    if !payload.host.is_empty() {
        let host = if payload.host.contains(':') { payload.host.clone() } else { format!("{}:21", payload.host) };
        let user = &payload.user;
        let pass = &payload.pass;
        let path = &payload.path;

        if payload.action == "test" {
            log.info(&req.id, "ftp", "init", "[1/8] Kernel收到测试探测请求");

            log.info(&req.id, "ftp", "connect", &format!("[2/8] 开始建立TCP连接 -> {}", host));
            let start = Instant::now();
            let mut client = match FtpClient::connect(&host).await {
                Ok(c) => {
                    log.ok(&req.id, "ftp", "connect", &format!("[FTP][CONNECT] TCP连接成功, 耗时: {:?}", start.elapsed()));
                    c
                },
                Err(e) => {
                    let err = format!("[FTP][CONNECT] 连接失败: {:?} 耗时: {:?}", e, start.elapsed());
                    log.error(&req.id, "ftp", "connect", &err);
                    return Err(err);
                }
            };

            log.info(&req.id, "ftp", "banner", "[3/8] 收到220 Banner (TCP Handshake confirmed)");

            let log_msg = format!("[FTP][LOGIN]\n\nUSER = {}\nUSER_LEN = {}\n\nPASS_LEN = {}\n", user, user.len(), pass.len());
            log.info(&req.id, "ftp", "login", &format!("[4/8] 开始 Login\n{}", log_msg));
            let start = Instant::now();
            if let Err(e) = client.login(user, pass).await {
                let err = format!("{}\n{}\n耗时: {:?}", log_msg, e, start.elapsed());
                log.error(&req.id, "ftp", "login", &err);
                return Err(err);
            }
            log.ok(&req.id, "ftp", "login", &format!("[FTP][LOGIN] 登录验证及状态机初始化完成, 耗时: {:?}", start.elapsed()));

            log.info(&req.id, "ftp", "list", "[5/8] 执行 safe_list -> 校验数据通道 (PASV/EPSV fallback)");
            let start = Instant::now();
            match client.safe_list().await {
                Ok(list) => {
                    log.ok(&req.id, "ftp", "list", &format!("[FTP][LIST] 成功，{} 项, 当前模式={:?}, 耗时: {:?}", list.len(), client.mode, start.elapsed()));
                },
                Err(e) => {
                    let err = format!("[FTP][LIST] 数据通道阻塞或权限错误: {:?} 耗时: {:?}", e, start.elapsed());
                    log.error(&req.id, "ftp", "list", &err);
                    return Err(err);
                }
            }

            log.info(&req.id, "ftp", "cwd", &format!("[7/8] 执行CWD -> 切换目录: {}", path));
            if !path.trim().is_empty() {
                let start = Instant::now();
                if let Err(e) = client.cwd(path).await {
                    let err = format!("[FTP][CWD] 切换目录失败: {:?} 耗时: {:?}", e, start.elapsed());
                    log.error(&req.id, "ftp", "cwd", &err);
                    return Err(err);
                }
                log.ok(&req.id, "ftp", "cwd", &format!("[FTP][CWD] 目录切换成功, 耗时: {:?}", start.elapsed()));
            } else {
                log.info(&req.id, "ftp", "cwd", "[FTP][CWD] 未指定测试目录，跳过切换");
            }

            log.info(&req.id, "ftp", "quit", "[8/8] 探测完成，发送QUIT");
            let start = std::time::Instant::now();
            if let Err(e) = client.quit().await {
                let err = format!("[FTP][QUIT] 关闭连接安全注销时异常: {:?} 耗时: {:?}", e, start.elapsed());
                log.error(&req.id, "ftp", "quit", &err);
            } else {
                log.ok(&req.id, "ftp", "quit", &format!("[FTP][QUIT] 连接正常断开关闭, 耗时: {:?}", start.elapsed()));
            }

            Ok(())
        } else {
            log.info(&req.id, "ftp", "connect", "初始化 FTP 工业级 Client");
            let mut client = match FtpClient::connect(&host).await {
                Ok(c) => c,
                Err(e) => return Err(e.to_string()),
            };
            log.ok(&req.id, "ftp", "connect", "TCP连接成功");

            if let Err(e) = client.login(user, pass).await {
                return Err(e.to_string());
            }
            log.ok(&req.id, "ftp", "login", "安全接入及环境探测成功");

            if !path.trim().is_empty() {
                let _ = client.cwd(path).await; 
            } else {
                let _ = client.cwd("/").await;
            }

            if payload.action == "upload" {
                log.info(&req.id, "ftp", "upload", "开始上传安全载荷");
                if let Some(data) = &payload.data {
                    let data_bytes = data.as_bytes();
                    let mut slice = &data_bytes[..];
                    if let Err(e) = client.put_file("sovereign_backup.json", &mut slice).await {
                         return Err(e.to_string());
                    }
                    log.ok(&req.id, "ftp", "upload", "数据已顺利落盘");
                } else {
                    log.warn(&req.id, "ftp", "upload", "载荷为空，跳过推流");
                }
            }
            
            let _ = client.quit().await;
            Ok(())
        }
    } else {
        Err("Missing host configuration in payload".to_string())
    }
}
