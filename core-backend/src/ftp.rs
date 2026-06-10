use suppaftp::AsyncFtpStream;
use serde::Deserialize;

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
    pub async fn upload_sync(config: &FtpConfig, content: Vec<u8>) -> Result<(), String> {
        let host = if config.host.contains(':') {
            config.host.clone()
        } else {
            format!("{}:21", config.host)
        };
        
        println!("[FTP] 开始连接 {}", host);
        let mut ftp_stream = AsyncFtpStream::connect(&host).await.map_err(|e| format!("FTP连接失败: {}", e))?;
        println!("[FTP] 连接成功");

        ftp_stream.login(&config.user, &config.pass).await.map_err(|e| format!("FTP登录失败: {}", e))?;
        println!("[FTP] 登录成功");
        
        // 测试数据通道是否正常
        match ftp_stream.list(None).await {
            Ok(list) => {
                println!("[FTP] LIST成功，共{}项", list.len());
            }
            Err(e) => {
                println!("[FTP] LIST失败(可能因为防火墙或被动模式受阻): {}", e);
            }
        }

        // 切目录
        if !config.path.trim().is_empty() {
            println!("[FTP] 尝试切换目录: {}", config.path);
            ftp_stream.cwd(&config.path).await.map_err(|e| format!("切换目录失败 '{}': {}", config.path, e))?;
            println!("[FTP] 切换目录成功");
        }
        
        println!("[FTP] 开始上传 sovereign_backup.json (共 {} 字节)", content.len());
        let mut slice = &content[..];
        ftp_stream.put_file("sovereign_backup.json", &mut slice).await.map_err(|e| format!("上传失败: {}", e))?;
        println!("[FTP] 上传成功！");

        let _ = ftp_stream.quit().await;
        Ok(())
    }

    pub async fn download_sync(config: &FtpConfig) -> Result<Option<Vec<u8>>, String> {
        let host = if config.host.contains(':') {
            config.host.clone()
        } else {
            format!("{}:21", config.host)
        };
        
        println!("[FTP] 开始下载连接 {}", host);
        let mut ftp_stream = AsyncFtpStream::connect(&host).await.map_err(|e| format!("FTP连接失败: {}", e))?;
        println!("[FTP] 连接成功");

        ftp_stream.login(&config.user, &config.pass).await.map_err(|e| format!("FTP登录失败: {}", e))?;
        println!("[FTP] 登录成功");

        // 测试数据通道是否正常
        match ftp_stream.list(None).await {
            Ok(list) => {
                println!("[FTP] LIST成功，共{}项", list.len());
            }
            Err(e) => {
                println!("[FTP] LIST失败(可能因为防火墙或被动模式受阻): {}", e);
            }
        }

        // 切目录
        if !config.path.trim().is_empty() {
            println!("[FTP] 尝试切换目录: {}", config.path);
            ftp_stream.cwd(&config.path).await.map_err(|e| format!("切换目录失败 '{}': {}", config.path, e))?;
            println!("[FTP] 切换目录成功");
        }
        
        println!("[FTP] 开始获取文件: sovereign_backup.json");
        match ftp_stream.retr_as_stream("sovereign_backup.json").await {
            Ok(mut data_stream) => {
                use futures_util::io::AsyncReadExt;
                let mut buffer = Vec::new();
                if let Err(e) = data_stream.read_to_end(&mut buffer).await {
                    let _ = ftp_stream.quit().await;
                    return Err(format!("读取下载流失败: {}", e));
                }
                
                if let Err(e) = ftp_stream.finalize_retr_stream(data_stream).await {
                    let _ = ftp_stream.quit().await;
                    return Err(format!("确认下载流完成失败: {}", e));
                }
                
                println!("[FTP] 文件获取成功，共 {} 字节", buffer.len());
                let _ = ftp_stream.quit().await;
                Ok(Some(buffer))
            }
            Err(e) => {
                let _ = ftp_stream.quit().await;
                let err_msg = e.to_string();
                if err_msg.contains("550") || err_msg.contains("not found") || err_msg.contains("No such file") || err_msg.contains("not exist") {
                    println!("[FTP] 备份文件尚未存在(首次同步)，返空。");
                    Ok(None)
                } else {
                    Err(format!("获取下载流出错: {}", err_msg))
                }
            }
        }
    }
}
