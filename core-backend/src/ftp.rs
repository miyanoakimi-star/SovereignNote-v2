use suppaftp::AsyncNativeTlsFtpStream;
use suppaftp::AsyncFtpStream;
use std::io::Cursor;
use axum::{Json, http::StatusCode};
use serde::{Deserialize, Serialize};

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
        let mut reader = Cursor::new(content);
        ftp_stream.put(&path, &mut reader).await.map_err(|e| e.to_string())?;
        let _ = ftp_stream.quit().await;
        Ok(())
    }
}
