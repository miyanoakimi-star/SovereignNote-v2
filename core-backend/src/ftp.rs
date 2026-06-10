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
        
        let mut ftp_stream = AsyncFtpStream::connect(&host).await.map_err(|e| e.to_string())?;
        
        if config.secure {
            // Note: In a real app we'd upgrade to TLS, but we'll leave it simple for now or use the method if available
            // let mut ftp_stream = ftp_stream.into_secure(native_tls::TlsConnector::new().unwrap(), &config.host).await.map_err(|e| e.to_string())?;
            // ftp_stream.login(&config.user, &config.pass).await.map_err(|e| e.to_string())?;
        }
        
        ftp_stream.login(&config.user, &config.pass).await.map_err(|e| e.to_string())?;
        
        let path = format!("{}/sovereign_backup.json", config.path);
        let mut slice = &content[..];
        ftp_stream.put_file(&path, &mut slice).await.map_err(|e| e.to_string())?;
        let _ = ftp_stream.quit().await;
        Ok(())
    }

    pub async fn download_sync(config: &FtpConfig) -> Result<Option<Vec<u8>>, String> {
        let host = if config.host.contains(':') {
            config.host.clone()
        } else {
            format!("{}:21", config.host)
        };
        
        let mut ftp_stream = AsyncFtpStream::connect(&host).await.map_err(|e| e.to_string())?;
        ftp_stream.login(&config.user, &config.pass).await.map_err(|e| e.to_string())?;
        
        let path = format!("{}/sovereign_backup.json", config.path);
        
        match ftp_stream.retr_as_stream(&path).await {
            Ok(mut data_stream) => {
                use futures_util::io::AsyncReadExt;
                let mut buffer = Vec::new();
                if let Err(e) = data_stream.read_to_end(&mut buffer).await {
                    let _ = ftp_stream.quit().await;
                    return Err(e.to_string());
                }
                
                if let Err(e) = ftp_stream.finalize_retr_stream(data_stream).await {
                    let _ = ftp_stream.quit().await;
                    return Err(e.to_string());
                }
                
                let _ = ftp_stream.quit().await;
                Ok(Some(buffer))
            }
            Err(e) => {
                let _ = ftp_stream.quit().await;
                let err_msg = e.to_string();
                if err_msg.contains("550") || err_msg.contains("not found") || err_msg.contains("No such file") || err_msg.contains("not exist") {
                    Ok(None)
                } else {
                    Err(err_msg)
                }
            }
        }
    }
}
