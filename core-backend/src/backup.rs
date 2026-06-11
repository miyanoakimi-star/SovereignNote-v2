use crate::db::{DbPool, Note};
use axum::{
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupConfig {
    pub retention: RetentionConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RetentionConfig {
    pub max_auto_per_day: usize,
    pub max_auto_total: usize,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            retention: RetentionConfig {
                max_auto_per_day: 1,
                max_auto_total: 2,
            },
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupMeta {
    pub version: i32,
    pub created_at: i64,
    pub r#type: String, // "auto" | "manual"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupItem {
    pub file_name: String,
    pub created_at: i64,
    pub r#type: String,
}

pub fn backup_routes() -> Router<crate::api::AppState> {
    Router::new()
        .route("/list", get(list_backups))
        .route("/manual", post(create_manual_backup))
        .route("/auto/run", post(create_auto_backup))
        .route("/import", post(import_backup))
        .route("/download/:id", get(download_backup))
}

fn get_backups_dir() -> PathBuf {
    let dir = PathBuf::from("backups");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

async fn list_backups() -> Result<Json<Vec<BackupItem>>, (StatusCode, String)> {
    let dir = get_backups_dir();
    let mut backups = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "zip") {
                let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let r#type = if file_name.contains("auto") { "auto" } else { "manual" };
                let created_at = entry.metadata().unwrap().modified().unwrap().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;

                backups.push(BackupItem {
                    file_name,
                    created_at,
                    r#type: r#type.to_string(),
                });
            }
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(Json(backups))
}

fn extract_notes(pool: &DbPool) -> Result<Vec<Note>, Box<dyn std::error::Error + Send + Sync>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id, title, content, created_at, updated_at, deleted FROM notes")?;
    let notes_iter = stmt.query_map([], |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            deleted: row.get::<_, i32>(5)? != 0,
        })
    })?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note?);
    }
    Ok(notes)
}

fn create_backup_zip(pool: DbPool, backup_type: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let dir = get_backups_dir();
    let now = Local::now();
    let timestamp_str = now.format("%Y-%m-%d_%H%M%S").to_string();
    let filename = format!("backup_{}_{}.zip", backup_type, timestamp_str);
    let filepath = dir.join(&filename);

    let file = fs::File::create(&filepath)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // 1. notes.json
    let notes = extract_notes(&pool)?;
    let notes_json = serde_json::to_string_pretty(&notes)?;
    zip.start_file("notes.json", options)?;
    zip.write_all(notes_json.as_bytes())?;

    // 2. meta.json
    let meta = BackupMeta {
        version: 1,
        created_at: now.timestamp(),
        r#type: backup_type.to_string(),
    };
    let meta_json = serde_json::to_string_pretty(&meta)?;
    zip.start_file("meta.json", options)?;
    zip.write_all(meta_json.as_bytes())?;

    // 3. config.json
    let config = BackupConfig::default();
    let config_json = serde_json::to_string_pretty(&config)?;
    zip.start_file("config.json", options)?;
    zip.write_all(config_json.as_bytes())?;

    // 4. version.txt
    zip.start_file("version.txt", options)?;
    zip.write_all(b"1.0")?;

    zip.finish()?;

    // Cleanup auto backups
    if backup_type == "auto" {
        cleanup_auto_backups(&dir)?;
    }

    Ok(filename)
}

fn cleanup_auto_backups(dir: &PathBuf) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut auto_backups = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "zip") {
                let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if file_name.contains("auto") {
                    let md = entry.metadata()?;
                    let created = md.modified()?.duration_since(std::time::UNIX_EPOCH)?.as_secs();
                    auto_backups.push((created, path));
                }
            }
        }
    }

    auto_backups.sort_by_key(|k| k.0);

    let config = BackupConfig::default();
    let max_total = config.retention.max_auto_total;

    if auto_backups.len() > max_total {
        let to_remove = auto_backups.len() - max_total;
        for i in 0..to_remove {
            let _ = fs::remove_file(&auto_backups[i].1);
        }
    }

    Ok(())
}

async fn create_manual_backup(State(state): State<crate::api::AppState>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let pool = state.pool.clone();
    let filename = tokio::task::spawn_blocking(move || {
        create_backup_zip(pool, "manual")
    }).await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "file": filename, "status": "ok" })))
}

async fn create_auto_backup(State(state): State<crate::api::AppState>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    // Check if we already created an auto backup today
    let dir = get_backups_dir();
    let now = Local::now();
    let today_prefix = format!("backup_auto_{}", now.format("%Y-%m-%d"));
    
    let mut already_backed_up_today = false;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with(&today_prefix) {
                already_backed_up_today = true;
                break;
            }
        }
    }

    if already_backed_up_today {
        return Ok(Json(serde_json::json!({ "status": "skipped", "reason": "Already backed up today" })));
    }

    let pool = state.pool.clone();
    let filename = tokio::task::spawn_blocking(move || {
        create_backup_zip(pool, "auto")
    }).await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "file": filename, "status": "ok" })))
}

async fn download_backup(Path(id): Path<String>) -> impl IntoResponse {
    let dir = get_backups_dir();
    let filepath = dir.join(&id);
    
    if !filepath.exists() {
        return (StatusCode::NOT_FOUND, "Backup not found".to_string()).into_response();
    }

    let file_content = match fs::read(&filepath) {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read backup".to_string()).into_response(),
    };

    let headers = [
        (header::CONTENT_TYPE, "application/zip".to_string()),
        (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", id)),
    ];

    (headers, file_content).into_response()
}

async fn import_backup(State(state): State<crate::api::AppState>, mut multipart: Multipart) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut zip_data = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
        if field.name() == Some("file") {
            zip_data = field.bytes().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?.to_vec();
            break;
        }
    }

    if zip_data.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No file provided".to_string()));
    }

    let pool = state.pool.clone();

    tokio::task::spawn_blocking(move || {
        let cursor = std::io::Cursor::new(zip_data);
        let mut zip = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;

        let mut notes_file = zip.by_name("notes.json").map_err(|e| e.to_string())?;
        let mut notes_content = String::new();
        notes_file.read_to_string(&mut notes_content).map_err(|e| e.to_string())?;

        let notes: Vec<Note> = serde_json::from_str(&notes_content).map_err(|e| e.to_string())?;

        crate::db::sync_notes(&pool, notes).map_err(|e| e.to_string())?;

        Ok::<(), String>(())
    }).await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "status": "ok", "message": "Backup imported and merged successfully" })))
}
