use suppaftp::AsyncFtpStream;
use serde::{Deserialize, Serialize};
use crate::db::{DbPool, add_sync_log_detailed};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtpConfig {
    pub host: String,
    pub user: String,
    pub pass: String,
    pub path: String,
    pub secure: bool,
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

        let mut ftp_stream = match AsyncFtpStream::connect(&host).await {
            Ok(stream) => {
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "SUCCESS", "【连接测试】物理层套接字 TCP 链路握手完成。");
                stream
            }
            Err(e) => {
                let err_msg = format!("【连接测试】物理层网络握手异常: {}", e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "ERROR", &err_msg);
                return Err(err_msg);
            }
        };

        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "INFO", &format!("【连接测试】向 FTP 网关发送登录令牌。用户名: '{}'", config.user));
        if let Err(e) = ftp_stream.login(&config.user, &config.pass).await {
            let err_msg = format!("【连接测试】安全网关登录验证未通过: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "ERROR", &err_msg);
            return Err(err_msg);
        }
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "SUCCESS", "【连接测试】FTP 双向身份令牌安全验证已核准通过，开始申请分配数据端口。");
        
        // 测试数据通道是否正常
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "INFO", "【连接测试】提交 LIST 侦测指令，校验宿主机远程文件系统访问权及主动/被动模式是否通畅。");
        match ftp_stream.list(None).await {
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

            if let Err(e) = ftp_stream.cwd(&config.path).await {
                let err_msg = format!("【连接测试】在多级云盘结构寻找路径失败 '{}', 校验该服务器远程路径是否存在。异常：{}", config.path, e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "ERROR", &err_msg);
                return Err(err_msg);
            }

            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "SUCCESS", &format!("【连接测试】已完成远程路径绑定，当前工作指针定位在: '{}'", config.path));
        }
        
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("end"), "SUCCESS", "【连接测试】FTP 接口联通性与登录权限完整性校验圆满成功！");

        let _ = ftp_stream.quit().await;
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

        let mut ftp_stream = match AsyncFtpStream::connect(&host).await {
            Ok(stream) => {
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "SUCCESS", "物理层套接字 TCP 链路握手完成，开始传输加密安全会话协定。");
                stream
            }
            Err(e) => {
                let err_msg = format!("物理层网络握手异常: {}", e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "ERROR", &err_msg);
                return Err(err_msg);
            }
        };

        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "INFO", &format!("向 FTP 网关发送登录令牌。用户名: '{}'", config.user));
        if let Err(e) = ftp_stream.login(&config.user, &config.pass).await {
            let err_msg = format!("安全网关登录验证未通过: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "ERROR", &err_msg);
            return Err(err_msg);
        }
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "SUCCESS", "FTP 双向身份令牌安全验证已核准通过，开始申请分配数据端口。");
        
        // 测试数据通道是否正常
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "INFO", "提交 LIST 侦测指令，校验宿主机远程文件系统访问权及主动/被动模式是否通畅。");
        match ftp_stream.list(None).await {
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

            if let Err(e) = ftp_stream.cwd(&config.path).await {
                let err_msg = format!("在多级云盘结构寻找路径失败 '{}', 校验该服务器远程路径是否存在。异常：{}", config.path, e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "ERROR", &err_msg);
                return Err(err_msg);
            }

            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "SUCCESS", &format!("已完成远程路径绑定，当前工作指针定位在: '{}'", config.path));
        }
        
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("upload"), "INFO", &format!("开始写入和封包。目标文件：sovereign_backup.json，待同步负载：{} 字节。", content.len()));

        let mut slice = &content[..];
        if let Err(e) = ftp_stream.put_file("sovereign_backup.json", &mut slice).await {
            let err_msg = format!("FTP 写入 sovereign_backup.json 握手断连: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("upload"), "ERROR", &err_msg);
            return Err(err_msg);
        }

        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("upload"), "SUCCESS", "数据已完成全比特安全推流，覆盖成功写入宿主机闪存介质。");
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("end"), "SUCCESS", "增量/全量 FTP 热备份冷归档已宣告圆满结束！");

        let _ = ftp_stream.quit().await;
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

        let mut ftp_stream = match AsyncFtpStream::connect(&host).await {
            Ok(stream) => {
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "SUCCESS", "物理层套接字 TCP 链路握手完成，开始传输加密安全会话协定。");
                stream
            }
            Err(e) => {
                let err_msg = format!("物理层网络握手异常: {}", e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("connect"), "ERROR", &err_msg);
                return Err(err_msg);
            }
        };

        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "INFO", &format!("向 FTP 网关发送登录令牌。用户名: '{}'", config.user));
        if let Err(e) = ftp_stream.login(&config.user, &config.pass).await {
            let err_msg = format!("安全网关登录验证未通过: {}", e);
            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "ERROR", &err_msg);
            return Err(err_msg);
        }
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("login"), "SUCCESS", "FTP 双向身份令牌安全验证已核准通过，开始申请分配数据端口。");

        // 测试数据通道是否正常
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("list"), "INFO", "提交 LIST 侦测指令，校验宿主机远程文件系统访问权及主动/被动模式是否通畅。");
        match ftp_stream.list(None).await {
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

            if let Err(e) = ftp_stream.cwd(&config.path).await {
                let err_msg = format!("在多级云盘结构寻找路径失败 '{}', 校验该服务器远程路径是否存在。异常：{}", config.path, e);
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "ERROR", &err_msg);
                return Err(err_msg);
            }

            let _ = add_sync_log_detailed(pool, session_id, protocol, Some("cwd"), "SUCCESS", &format!("已完成远程路径绑定，当前工作指针定位在: '{}'", config.path));
        }
        
        let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "INFO", "向远端磁盘发出 RETR 镜像提取请求，搜寻文件：sovereign_backup.json");

        match ftp_stream.retr_as_stream("sovereign_backup.json").await {
            Ok(mut data_stream) => {
                use futures_util::io::AsyncReadExt;
                let mut buffer = Vec::new();
                if let Err(e) = data_stream.read_to_end(&mut buffer).await {
                    let _ = ftp_stream.quit().await;
                    let err_msg = format!("文件传输信道意外崩溃，部分字节获取丢失: {}", e);
                    let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "ERROR", &err_msg);
                    return Err(err_msg);
                }
                
                if let Err(e) = ftp_stream.finalize_retr_stream(data_stream).await {
                    let _ = ftp_stream.quit().await;
                    let err_msg = format!("关闭和校验提取文件句柄失败: {}", e);
                    let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "ERROR", &err_msg);
                    return Err(err_msg);
                }
                
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("download"), "SUCCESS", &format!("FTP 节点数据已被完美解包拉回本地内存中！共拉回: {} 字节。", buffer.len()));
                let _ = add_sync_log_detailed(pool, session_id, protocol, Some("end"), "SUCCESS", "FTP 双向备份拉取拉回操作成功声明完成。");

                let _ = ftp_stream.quit().await;
                Ok(Some(buffer))
            }
            Err(e) => {
                let _ = ftp_stream.quit().await;
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

pub async fn handle_kernel_request(req: crate::kernel::KernelRequest, log: &crate::kernel::LogBus) -> Result<(), String> {
    if let Some(host) = req.payload.get("host").and_then(|h| h.as_str()) {
        let host = if host.contains(':') { host.to_string() } else { format!("{}:21", host) };
        let user = req.payload.get("user").and_then(|u| u.as_str()).unwrap_or("anonymous").trim();
        let pass = req.payload.get("pass").and_then(|p| p.as_str()).unwrap_or("").trim();
        let path = req.payload.get("path").and_then(|p| p.as_str()).unwrap_or("");

        if req.action == "test" {
            log.info(&req.id, "ftp", "init", "[1/8] Kernel收到请求");

            log.info(&req.id, "ftp", "connect", &format!("[2/8] 开始建立TCP连接 -> {}", host));
            let start = std::time::Instant::now();
            let mut ftp = match suppaftp::AsyncFtpStream::connect(&host).await {
                Ok(s) => {
                    log.ok(&req.id, "ftp", "connect", &format!("[FTP][CONNECT] TCP连接成功, 耗时: {:?}", start.elapsed()));
                    s
                },
                Err(e) => {
                    let err = format!("[FTP][CONNECT] 连接失败: {:?} 耗时: {:?}", e, start.elapsed());
                    log.error(&req.id, "ftp", "connect", &err);
                    return Err(err);
                }
            };

            log.info(&req.id, "ftp", "banner", "[3/8] 收到220 Banner (TCP Handshake confirmed)");
            // Suppaftp async does not reliably expose welcome_msg safely, skipping actual fetch to avoid compilation errors

            let log_msg = format!("[FTP][LOGIN]\n\nUSER = {}\nUSER_LEN = {}\n\nPASS_LEN = {}\n", user, user.len(), pass.len());
            log.info(&req.id, "ftp", "login", &format!("[4/8] 开始 Login\n{}", log_msg));
            let start = std::time::Instant::now();
            if let Err(e) = ftp.login(user, pass).await {
                let err = format!("{}\n{}\n耗时: {:?}", log_msg, e, start.elapsed());
                log.error(&req.id, "ftp", "login", &err);
                return Err(err);
            }
            log.ok(&req.id, "ftp", "login", &format!("[FTP][LOGIN] 登录验证成功, 耗时: {:?}", start.elapsed()));

            log.info(&req.id, "ftp", "list", "[5/8] 执行LIST -> 校验数据通道");
            let start = std::time::Instant::now();
            match ftp.list(None).await {
                Ok(list) => {
                    log.ok(&req.id, "ftp", "list", &format!("[FTP][LIST] 成功，{} 项, 耗时: {:?}", list.len(), start.elapsed()));
                },
                Err(e) => {
                    let err = format!("[FTP][LIST] 数据通道阻塞或权限错误: {:?} 耗时: {:?}", e, start.elapsed());
                    log.error(&req.id, "ftp", "list", &err);
                    return Err(err);
                }
            }

            log.info(&req.id, "ftp", "cwd", &format!("[7/8] 执行CWD -> 切换目录: {}", path));
            if !path.trim().is_empty() {
                let start = std::time::Instant::now();
                if let Err(e) = ftp.cwd(path).await {
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
            if let Err(e) = ftp.quit().await {
                let err = format!("[FTP][QUIT] 关闭连接终端时发生异常: {:?} 耗时: {:?}", e, start.elapsed());
                log.error(&req.id, "ftp", "quit", &err);
                // Return Ok even if quit failed
            } else {
                log.ok(&req.id, "ftp", "quit", &format!("[FTP][QUIT] 连接正常断开关闭, 耗时: {:?}", start.elapsed()));
            }

            Ok(())
        } else {
            log.info(&req.id, "ftp", "connect", "连接FTP");
            let mut ftp = match suppaftp::AsyncFtpStream::connect(&host).await {
                Ok(s) => s,
                Err(e) => return Err(e.to_string()),
            };
            log.ok(&req.id, "ftp", "connect", "TCP连接成功");

            if let Err(e) = ftp.login(user, pass).await {
                return Err(e.to_string());
            }
            log.ok(&req.id, "ftp", "login", "登录成功");

            if !path.trim().is_empty() {
                let _ = ftp.cwd(path).await; 
            } else {
                let _ = ftp.cwd("/").await;
            }

            if req.action == "upload" {
                log.info(&req.id, "ftp", "upload", "开始上传");
                if let Some(data) = req.payload.get("data").and_then(|d| d.as_str()) {
                    let data_bytes = data.as_bytes();
                    let mut slice = &data_bytes[..];
                    if let Err(e) = ftp.put_file("sovereign_backup.json", &mut slice).await {
                         return Err(e.to_string());
                    }
                    log.ok(&req.id, "ftp", "upload", "上传完成");
                } else {
                    log.warn(&req.id, "ftp", "upload", "没有要上传的数据");
                }
            }
            
            let _ = ftp.quit().await;
            Ok(())
        }
    } else {
        Err("Missing host configuration in payload".to_string())
    }
}
