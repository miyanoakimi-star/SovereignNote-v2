use axum::{
    extract::State,
    http::StatusCode,
    Json,
    routing::{get, post},
    Router,
};
use crate::db::{self, DbPool, Note};
use crate::ftp::{FtpConfig, FtpStorageProvider};

pub fn router(pool: DbPool) -> Router {
    Router::new()
        .route("/notes", get(get_notes))
        .route("/notes/sync", post(sync_notes))
        .route("/notes/sync/force", post(force_sync))
        .route("/sync/ftp", post(sync_to_ftp))
        .with_state(pool)
}

async fn force_sync(
    State(pool): State<DbPool>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    // 强制同步逻辑：返回最新所有笔记（触发 MDNS 广播在更复杂的设计中）
    match db::get_all_notes(&pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Force sync error: {}", err),
        )),
    }
}

async fn sync_to_ftp(
    State(pool): State<DbPool>,
    Json(config): Json<FtpConfig>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let notes = db::get_all_notes(&pool).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "读取数据库失败",
                "error": e.to_string()
            })),
        )
    })?;
    
    let content = serde_json::to_vec(&notes).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "序列化数据失败",
                "error": e.to_string()
            })),
        )
    })?;
    
    match FtpStorageProvider::upload_sync(&config, content).await {
        Ok(_) => Ok(Json(serde_json::json!({
            "success": true,
            "message": "FTP 备份推送成功"
        }))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": e
            })),
        )),
    }
}

async fn get_notes(
    State(pool): State<DbPool>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    match db::get_all_notes(&pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", err),
        )),
    }
}

async fn sync_notes(
    State(pool): State<DbPool>,
    Json(incoming_notes): Json<Vec<Note>>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    match db::sync_notes(&pool, incoming_notes) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Sync merge error: {}", err),
        )),
    }
}
