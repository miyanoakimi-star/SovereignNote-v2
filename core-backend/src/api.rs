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
        .route("/sync/ftp/pull", post(pull_from_ftp))
        .route("/sync/ftp/sync", post(bidirectional_ftp_sync))
        .with_state(pool)
}

fn parse_notes_from_bytes(bytes: &[u8]) -> Result<Vec<Note>, String> {
    if let Ok(notes) = serde_json::from_slice::<Vec<Note>>(bytes) {
        return Ok(notes);
    }
    
    // 降级尝试：如果备份文件是完整的 App JSON 数据，则提取里面的 notes
    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) {
        if let Some(notes_val) = value.get("notes") {
            if let Ok(notes) = serde_json::from_value::<Vec<Note>>(notes_val.clone()) {
                return Ok(notes);
            }
        }
    }
    
    Err("无法识别的备份 JSON 格式".to_string())
}

async fn pull_from_ftp(
    State(pool): State<DbPool>,
    Json(config): Json<FtpConfig>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let bytes_opt = FtpStorageProvider::download_sync(&config).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": format!("FTP 下载失败: {}", e)
            })),
        )
    })?;

    let bytes = match bytes_opt {
        Some(b) => b,
        None => {
            return Ok(Json(serde_json::json!({
                "success": true,
                "message": "FTP 服务器上未发现备份文件(sovereign_backup.json)，无法提取备份。",
                "notes": []
            })));
        }
    };

    let notes = parse_notes_from_bytes(&bytes).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": format!("解析备份文件失败: {}", e)
            })),
        )
    })?;

    let merged_notes = db::sync_notes(&pool, notes).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "合并数据到本地数据库失败",
                "error": e.to_string()
            })),
        )
    })?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "FTP 数据拉取并合并成功！",
        "notes": merged_notes
    })))
}

async fn bidirectional_ftp_sync(
    State(pool): State<DbPool>,
    Json(config): Json<FtpConfig>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // 1. 下载 FTP 备份（若文件存在）
    let bytes_opt = FtpStorageProvider::download_sync(&config).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": format!("FTP 备份合并下载失败: {}", e)
            })),
        )
    })?;

    if let Some(bytes) = bytes_opt {
        if let Ok(ftp_notes) = parse_notes_from_bytes(&bytes) {
            // 合合并入 SQLite，进行 LWW
            let _ = db::sync_notes(&pool, ftp_notes);
        }
    }

    // 2. 取出合并后的全部最新 LWW 笔记记录
    let all_notes = db::get_all_notes(&pool).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "获取最新的本地数据库记录出错",
                "error": e.to_string()
            })),
        )
    })?;

    // 3. 序列化并再回推覆盖 FTP 备份，完成双向闭环同步
    let upload_content = serde_json::to_vec(&all_notes).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "对合并后的数据序列化失败",
                "error": e.to_string()
            })),
        )
    })?;

    FtpStorageProvider::upload_sync(&config, upload_content).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": format!("FTP 覆盖同步更新失败: {}", e)
            })),
        )
    })?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "FTP 双向同步成功！云端与本地已融合同步。",
        "notes": all_notes
    })))
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
