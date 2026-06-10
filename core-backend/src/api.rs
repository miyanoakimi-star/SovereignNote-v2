use axum::{
    extract::State,
    http::StatusCode,
    Json,
    routing::{get, post, delete},
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
        
        // 新增同步日志端点
        .route("/sync/logs", get(get_sync_logs_api).delete(clear_sync_logs_api))
        .route("/sync/logs/add", post(add_sync_log_api))
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
    let _ = db::add_sync_log(&state.pool, "INFO", "客户端发起笔记全量获取请求 (get_notes_new)");
    match db::get_all_notes(&state.pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => {
            let _ = db::add_sync_log(&state.pool, "ERROR", &format!("笔记全量获取失败: {}", err));
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", err),
            ))
        }
    }
}

async fn update_note_new(
    State(state): State<AppState>,
    Json(note): Json<Note>,
) -> Result<Json<Note>, (StatusCode, String)> {
    // 1. 本地更新，应用 LWW
    let _ = db::add_sync_log(&state.pool, "INFO", &format!("客户端尝试更新单篇笔记 id: {}, 标题: '{}'", note.id, note.title));
    match db::update_note(&state.pool, note) {
        Ok(updated) => {
            // 2. 更新成功后，通过 SSE 广播事件给所有在线客户端
            let event_payload = serde_json::json!({
                "type": "note_updated",
                "note_id": updated.id,
                "updated_at": updated.updated_at
            });
            let _ = state.tx.send(event_payload.to_string());
            let _ = db::add_sync_log(&state.pool, "INFO", "笔记更新成功并完成在线客户端局域网 SSE 广播。");
            
            Ok(Json(updated))
        }
        Err(err) => {
            let _ = db::add_sync_log(&state.pool, "ERROR", &format!("更新笔记失败: {}", err));
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to update note: {}", err),
            ))
        }
    }
}

async fn sync_pull(
    State(state): State<AppState>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    let _ = db::add_sync_log(&state.pool, "INFO", "客户端拉取本地最新 LWW 数据段 (sync_pull)");
    match db::get_all_notes(&state.pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => {
            let _ = db::add_sync_log(&state.pool, "ERROR", &format!("拉取本地 LWW 数据段失败: {}", err));
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {}", err),
            ))
        }
    }
}

async fn sync_push(
    State(state): State<AppState>,
    Json(incoming_notes): Json<Vec<Note>>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    let _ = db::add_sync_log(&state.pool, "INFO", &format!("同步推送：客户端尝试与本地 SQLite 融合 {} 篇笔记 (LWW 算法)", incoming_notes.len()));
    match db::sync_notes(&state.pool, incoming_notes) {
        Ok(notes) => {
            // 广播增量事件
            let event_payload = serde_json::json!({
                "type": "notes_synced"
            });
            let _ = state.tx.send(event_payload.to_string());
            let _ = db::add_sync_log(&state.pool, "SUCCESS", "笔记 LWW 融合完毕，发出 SSE 实时差分触发机制。");
            
            Ok(Json(notes))
        }
        Err(err) => {
            let _ = db::add_sync_log(&state.pool, "ERROR", &format!("笔记 LWW 融合失败: {}", err));
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Sync merge error: {}", err),
            ))
        }
    }
}

async fn events_sse(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let _ = db::add_sync_log(&state.pool, "INFO", "SSE 实时订阅：新增客户端通道已连接。");
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
    let _ = db::add_sync_log(&state.pool, "INFO", "开始执行 FTP 拉取进程。");
    
    let bytes_opt = FtpStorageProvider::download_sync(&state.pool, &config).await.map_err(|e| {
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("FTP 下载失败: {}", e));
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
            let _ = db::add_sync_log(&state.pool, "WARN", "FTP 服务器上未发现备份文件(sovereign_backup.json)，返空。");
            return Ok(Json(serde_json::json!({
                "success": true,
                "message": "FTP 服务器上未发现备份文件(sovereign_backup.json)，无法提取备份。",
                "notes": []
            })));
        }
    };

    let notes = parse_notes_from_bytes(&bytes).map_err(|e| {
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("解析备份文件失败: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": format!("解析备份文件失败: {}", e)
            })),
        )
    })?;

    let merged_notes = db::sync_notes(&state.pool, notes).map_err(|e| {
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("合并数据到本地数据库失败: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "合并数据到本地数据库失败",
                "error": e.to_string()
            })),
        )
    })?;

    let _ = db::add_sync_log(&state.pool, "SUCCESS", "FTP 拉取合并流程全部成功！已将云端差异数据合并。");
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
    let _ = db::add_sync_log(&state.pool, "INFO", "开始执行 FTP 双向闭环同步 (下载 -> 本地LWW合并 -> 覆盖上载)");
    
    // 1. 下载 FTP 备份（若文件存在）
    let bytes_opt = FtpStorageProvider::download_sync(&state.pool, &config).await.map_err(|e| {
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("FTP 双向同步：合并下载阶段失败: {}", e));
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
            let _ = db::add_sync_log(&state.pool, "INFO", &format!("对从 FTP 下载的 {} 篇云端笔记在本地执行 LWW 调停机制", ftp_notes.len()));
            let _ = db::sync_notes(&state.pool, ftp_notes);
        }
    }

    // 2. 取出合并后的全部最新 LWW 笔记记录
    let all_notes = db::get_all_notes(&state.pool).map_err(|e| {
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("双向同步读取本地数据库出错: {}", e));
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
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("双向同步合并序列化失败: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "对合并后的数据序列化失败",
                "error": e.to_string()
            })),
        )
    })?;

    let _ = db::add_sync_log(&state.pool, "INFO", &format!("正在回推融合同步后的全量最新数据 (共 {} 篇 / 字节数: {})", all_notes.len(), upload_content.len()));
    FtpStorageProvider::upload_sync(&state.pool, &config, upload_content).await.map_err(|e| {
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("FTP 覆盖同步更新失败: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": format!("FTP 覆盖同步更新失败: {}", e)
            })),
        )
    })?;

    let _ = db::add_sync_log(&state.pool, "SUCCESS", "FTP 客户端与服务端双向融合闭环同步大获成功！");
    Ok(Json(serde_json::json!({
        "success": true,
        "message": "FTP 双向同步成功！云端与本地已融合同步。",
        "notes": all_notes
    })))
}

async fn force_sync(
    State(state): State<AppState>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    let _ = db::add_sync_log(&state.pool, "INFO", "触发强制手动同步。");
    match db::get_all_notes(&state.pool) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => {
            let _ = db::add_sync_log(&state.pool, "ERROR", &format!("强制手动同步失败: {}", err));
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Force sync error: {}", err),
            ))
        }
    }
}

async fn sync_to_ftp(
    State(state): State<AppState>,
    Json(config): Json<FtpConfig>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let _ = db::add_sync_log(&state.pool, "INFO", "开始执行 FTP 推送备份。");
    let notes = db::get_all_notes(&state.pool).map_err(|e| {
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("推送备份前获取本地数据失败: {}", e));
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
        let _ = db::add_sync_log(&state.pool, "ERROR", &format!("推送备份序列化失败: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "序列化数据失败",
                "error": e.to_string()
            })),
        )
    })?;
    
    match FtpStorageProvider::upload_sync(&state.pool, &config, content).await {
        Ok(_) => {
            let _ = db::add_sync_log(&state.pool, "SUCCESS", "FTP 增量备份推送完成！");
            Ok(Json(serde_json::json!({
                "success": true,
                "message": "FTP 备份推送成功"
            })))
        }
        Err(e) => {
            let _ = db::add_sync_log(&state.pool, "ERROR", &format!("FTP 推送备份失败: {}", e));
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": e
                })),
            ))
        }
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
    let _ = db::add_sync_log(&state.pool, "INFO", &format!("已有旧终端同步：尝试融合 {} 篇笔记", incoming_notes.len()));
    match db::sync_notes(&state.pool, incoming_notes) {
        Ok(notes) => Ok(Json(notes)),
        Err(err) => {
            let _ = db::add_sync_log(&state.pool, "ERROR", &format!("已有旧终端数据合并失败: {}", err));
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Sync merge error: {}", err),
            ))
        }
    }
}

// ------------------- 同步日志 API -------------------

async fn get_sync_logs_api(
    State(state): State<AppState>,
) -> Result<Json<Vec<db::SyncLog>>, (StatusCode, String)> {
    match db::get_sync_logs(&state.pool) {
        Ok(logs) => Ok(Json(logs)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error on getting logs: {}", err),
        )),
    }
}

async fn clear_sync_logs_api(
    State(state): State<AppState>,
) -> Result<StatusCode, (StatusCode, String)> {
    match db::clear_sync_logs(&state.pool) {
        Ok(_) => {
            let _ = db::add_sync_log(&state.pool, "SUCCESS", "日志清空成功：历史记录已彻底销毁并重新初始化。");
            Ok(StatusCode::OK)
        }
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error on clearing logs: {}", err),
        )),
    }
}

#[derive(serde::Deserialize)]
pub struct AddLogRequest {
    pub level: String,
    pub message: String,
}

async fn add_sync_log_api(
    State(state): State<AppState>,
    Json(payload): Json<AddLogRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    match db::add_sync_log(&state.pool, &payload.level, &payload.message) {
        Ok(_) => Ok(StatusCode::OK),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error on adding log: {}", err),
        )),
    }
}
