use suppaftp::AsyncFtpStream;
use serde::Deserialize;
use crate::db::{DbPool, add_sync_log};

#[derive(Deserialize)]
pub struct FtpConfig {
    pub host: String,
    pub user: String,
    pub pass: String,
    pub path: String,
    pub secure: bool,
}

pub struct FtpStorageProvider;

impl FtpStorageProvider {
    pub async fn upload_sync(pool: &DbPool, config: &FtpConfig, content: Vec<u8>) -> Result<(), String> {
        let host = if config.host.contains(':') {
            config.host.clone()
        } else {
            format!("{}:21", config.host)
        };
        
        let msg = format!("开始连接 {}", host);
        println!("[FTP] {}", msg);
        let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));

        let mut ftp_stream = match AsyncFtpStream::connect(&host).await {
            Ok(stream) => {
                let msg = "连接成功".to_string();
                println!("[FTP] {}", msg);
                let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));
                stream
            }
            Err(e) => {
                let err_msg = format!("FTP连接失败: {}", e);
                println!("[FTP] {}", err_msg);
                let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
                return Err(err_msg);
            }
        };

        if let Err(e) = ftp_stream.login(&config.user, &config.pass).await {
            let err_msg = format!("FTP登录失败: {}", e);
            println!("[FTP] {}", err_msg);
            let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
            return Err(err_msg);
        }
        let msg = "登录成功".to_string();
        println!("[FTP] {}", msg);
        let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));
        
        // 测试数据通道是否正常
        match ftp_stream.list(None).await {
            Ok(list) => {
                let msg = format!("LIST成功，共定位 {} 个远程节点", list.len());
                println!("[FTP] {}", msg);
                let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));
            }
            Err(e) => {
                let err_msg = format!("LIST失败(可能因为防火墙拦截、路由器安全限制或被动模式受阻): {}", e);
                println!("[FTP] {}", err_msg);
                let _ = add_sync_log(pool, "WARN", &format!("[FTP] {}", err_msg));
            }
        }

        // 切目录
        if !config.path.trim().is_empty() {
            let msg = format!("尝试切换目录: {}", config.path);
            println!("[FTP] {}", msg);
            let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));

            if let Err(e) = ftp_stream.cwd(&config.path).await {
                let err_msg = format!("切换目录失败 '{}': {}", config.path, e);
                println!("[FTP] {}", err_msg);
                let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
                return Err(err_msg);
            }

            let msg = "切换目录成功".to_string();
            println!("[FTP] {}", msg);
            let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));
        }
        
        let msg = format!("开始上传 sovereign_backup.json (共 {} 字节)", content.len());
        println!("[FTP] {}", msg);
        let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));

        let mut slice = &content[..];
        if let Err(e) = ftp_stream.put_file("sovereign_backup.json", &mut slice).await {
            let err_msg = format!("上传失败: {}", e);
            println!("[FTP] {}", err_msg);
            let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
            return Err(err_msg);
        }

        let msg = "上传成功！".to_string();
        println!("[FTP] {}", msg);
        let _ = add_sync_log(pool, "SUCCESS", &format!("[FTP] {}", msg));

        let _ = ftp_stream.quit().await;
        Ok(())
    }

    pub async fn download_sync(pool: &DbPool, config: &FtpConfig) -> Result<Option<Vec<u8>>, String> {
        let host = if config.host.contains(':') {
            config.host.clone()
        } else {
            format!("{}:21", config.host)
        };
        
        let msg = format!("开始下载连接 {}", host);
        println!("[FTP] {}", msg);
        let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));

        let mut ftp_stream = match AsyncFtpStream::connect(&host).await {
            Ok(stream) => {
                let msg = "连接成功".to_string();
                println!("[FTP] {}", msg);
                let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));
                stream
            }
            Err(e) => {
                let err_msg = format!("FTP连接失败: {}", e);
                println!("[FTP] {}", err_msg);
                let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
                return Err(err_msg);
            }
        };

        if let Err(e) = ftp_stream.login(&config.user, &config.pass).await {
            let err_msg = format!("FTP登录失败: {}", e);
            println!("[FTP] {}", err_msg);
            let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
            return Err(err_msg);
        }
        let msg = "登录成功".to_string();
        println!("[FTP] {}", msg);
        let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));

        // 测试数据通道是否正常
        match ftp_stream.list(None).await {
            Ok(list) => {
                let msg = format!("LIST成功，共定位 {} 个远程节点", list.len());
                println!("[FTP] {}", msg);
                let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));
            }
            Err(e) => {
                let err_msg = format!("LIST失败(可能因为防火墙拦截、路由器安全限制或被动模式受阻): {}", e);
                println!("[FTP] {}", err_msg);
                let _ = add_sync_log(pool, "WARN", &format!("[FTP] {}", err_msg));
            }
        }

        // 切目录
        if !config.path.trim().is_empty() {
            let msg = format!("尝试切换目录: {}", config.path);
            println!("[FTP] {}", msg);
            let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));

            if let Err(e) = ftp_stream.cwd(&config.path).await {
                let err_msg = format!("切换目录失败 '{}': {}", config.path, e);
                println!("[FTP] {}", err_msg);
                let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
                return Err(err_msg);
            }

            let msg = "切换目录成功".to_string();
            println!("[FTP] {}", msg);
            let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));
        }
        
        let msg = "开始获取文件: sovereign_backup.json".to_string();
        println!("[FTP] {}", msg);
        let _ = add_sync_log(pool, "INFO", &format!("[FTP] {}", msg));

        match ftp_stream.retr_as_stream("sovereign_backup.json").await {
            Ok(mut data_stream) => {
                use futures_util::io::AsyncReadExt;
                let mut buffer = Vec::new();
                if let Err(e) = data_stream.read_to_end(&mut buffer).await {
                    let _ = ftp_stream.quit().await;
                    let err_msg = format!("读取下载流失败: {}", e);
                    let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
                    return Err(err_msg);
                }
                
                if let Err(e) = ftp_stream.finalize_retr_stream(data_stream).await {
                    let _ = ftp_stream.quit().await;
                    let err_msg = format!("确认下载流完成失败: {}", e);
                    let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", err_msg));
                    return Err(err_msg);
                }
                
                let msg = format!("文件获取成功，共 {} 字节", buffer.len());
                println!("[FTP] {}", msg);
                let _ = add_sync_log(pool, "SUCCESS", &format!("[FTP] {}", msg));

                let _ = ftp_stream.quit().await;
                Ok(Some(buffer))
            }
            Err(e) => {
                let _ = ftp_stream.quit().await;
                let err_msg = e.to_string();
                if err_msg.contains("550") || err_msg.contains("not found") || err_msg.contains("No such file") || err_msg.contains("not exist") {
                    let msg = "备份文件尚未存在(首次同步)，返空。".to_string();
                    println!("[FTP] {}", msg);
                    let _ = add_sync_log(pool, "WARN", &format!("[FTP] {}", msg));
                    Ok(None)
                } else {
                    let full_err = format!("获取下载流出错: {}", err_msg);
                    println!("[FTP] {}", full_err);
                    let _ = add_sync_log(pool, "ERROR", &format!("[FTP] {}", full_err));
                    Err(full_err)
                }
            }
        }
    }
}
