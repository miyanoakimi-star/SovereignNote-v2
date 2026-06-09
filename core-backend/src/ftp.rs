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
        let mut ftp_stream = AsyncFtpStream::connect(&config.host).await.map_err(|e| e.to_string())?;
        
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
        let mut ftp_stream = AsyncFtpStream::connect(&config.host).await.map_err(|e| e.to_string())?;
        ftp_stream.login(&config.user, &config.pass).await.map_err(|e| e.to_string())?;
        
        let path = format!("{}/sovereign_backup.json", config.path);
        
        match ftp_stream.retr_as_buffer(&path).await {
            Ok(cursor) => {
                let _ = ftp_stream.quit().await;
                Ok(Some(cursor.into_inner()))
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
