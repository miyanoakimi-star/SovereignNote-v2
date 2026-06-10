use axum::{
    extract::State,
    http::StatusCode,
    Json,
    routing::{get, post},
    Router,
    response::sse::{Event, KeepAlive, Sse},
};
use crate::db::{self, DbPool, Note};
use crate::ftp::{FtpConfig, FtpStorageProvider};
use futures_util::stream::{self, Stream};
use std::convert::Infallible;

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub tx: tokio::sync::broadcast::Sender<String>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        // 兼容已有旧端点
        .route("/notes", get(get_notes))
        .route("/notes/sync", post(sync_notes))
        .route("/notes/sync/force", post(force_sync))
        .route("/sync/ftp", post(sync_to_ftp))
        .route("/sync/ftp/pull", post(pull_from_ftp))
        .route("/sync/ftp/sync", post(bidirectional_ftp_sync))
        
        // 推荐的全新稳定高可用 LWW + SSE 架构端点
        .route("/notes/get", get(get_notes_new))
        .route("/notes/update", post(update_note_new))
        .route("/sync/pull", get(sync_pull))
        .route("/sync/push", post(sync_push))
        .route("/events", get(events_sse))
        .with_state(state)
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

// ------------------- 新架构端点实现 -------------------

async fn get_notes_new(
    State(state): State<AppState>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    match db::get_all_notes(&state.pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", err),
        )),
    }
}

async fn update_note_new(
    State(state): State<AppState>,
    Json(note): Json<Note>,
) -> Result<Json<Note>, (StatusCode, String)> {
    // 1. 本地更新，应用 LWW
    match db::update_note(&state.pool, note) {
        Ok(updated) => {
            // 2. 更新成功后，通过 SSE 广播事件给所有在线客户端
            let event_payload = serde_json::json!({
                "type": "note_updated",
                "note_id": updated.id,
                "updated_at": updated.updated_at
            });
            let _ = state.tx.send(event_payload.to_string());
            
            Ok(Json(updated))
        }
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to update note: {}", err),
        )),
    }
}

async fn sync_pull(
    State(state): State<AppState>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    match db::get_all_notes(&state.pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", err),
        )),
    }
}

async fn sync_push(
    State(state): State<AppState>,
    Json(incoming_notes): Json<Vec<Note>>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    match db::sync_notes(&state.pool, incoming_notes) {
        Ok(notes) => {
            // 广播增量事件
            let event_payload = serde_json::json!({
                "type": "notes_synced"
            });
            let _ = state.tx.send(event_payload.to_string());
            
            Ok(Json(notes))
        }
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Sync merge error: {}", err),
        )),
    }
}

async fn events_sse(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    
    // 使用 std::convert::Infallible
    let stream = stream::unfold(rx, |mut rx| async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    let event = Event::default().data(msg);
                    return Some((Ok(event), rx));
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                    // 当落后时继续获取下一次消息即可
                    continue;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    // 通道生命周期结束，终结 SSE 流
                    return None;
                }
            }
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ------------------- 兼容旧版端点实现 -------------------

async fn pull_from_ftp(
    State(state): State<AppState>,
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

    let merged_notes = db::sync_notes(&state.pool, notes).map_err(|e| {
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
    State(state): State<AppState>,
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
            let _ = db::sync_notes(&state.pool, ftp_notes);
        }
    }

    // 2. 取出合并后的全部最新 LWW 笔记记录
    let all_notes = db::get_all_notes(&state.pool).map_err(|e| {
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
    State(state): State<AppState>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    match db::get_all_notes(&state.pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Force sync error: {}", err),
        )),
    }
}

async fn sync_to_ftp(
    State(state): State<AppState>,
    Json(config): Json<FtpConfig>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let notes = db::get_all_notes(&state.pool).map_err(|e| {
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
    State(state): State<AppState>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    match db::get_all_notes(&state.pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {}", err),
        )),
    }
}

async fn sync_notes(
    State(state): State<AppState>,
    Json(incoming_notes): Json<Vec<Note>>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    match db::sync_notes(&state.pool, incoming_notes) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Sync merge error: {}", err),
        )),
    }
}
