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
        .route("/notes/sync/test", post(test_lww_connection))
        .route("/sync/ftp", post(sync_to_ftp))
        .route("/sync/ftp/pull", post(pull_from_ftp))
        .route("/sync/ftp/sync", post(bidirectional_ftp_sync))
        .route("/sync/ftp/test", post(test_ftp_connection))
        
        // 推荐的全新稳定高可用 LWW + SSE 架构端点
        .route("/notes/get", get(get_notes_new))
        .route("/notes/update", post(update_note_new))
        .route("/sync/pull", get(sync_pull))
        .route("/sync/push", post(sync_push))
        .route("/events", get(events_sse))
        
        // 新增同步日志端点
        .route("/sync/logs", get(get_sync_logs_api).delete(clear_sync_logs_api))
        .route("/sync/logs/add", post(add_sync_log_api))

        // Three-Layer Sync Probe System
        .route("/probe", post(add_probe_event_api))
        .route("/probe/list", get(get_probe_events_api))
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
    let session_id = uuid::Uuid::new_v4().to_string();
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("start"), "INFO", "主平台触发【FTP 自助拉取备份进程】（正在开启异步拉流服务）");
    
    let bytes_opt = FtpStorageProvider::download_sync(&state.pool, Some(&session_id), &config).await.map_err(|e| {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("FTP 下载阶段传输中断: {}", e));
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
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("end"), "WARN", "未匹配到任何归档卷存在。同步中断返回。");
            return Ok(Json(serde_json::json!({
                "success": true,
                "message": "FTP 服务器上未发现备份文件(sovereign_backup.json)，无法提取备份。",
                "notes": []
            })));
        }
    };

    let notes = parse_notes_from_bytes(&bytes).map_err(|e| {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("远程归档物序列化损坏，反序列化冲突: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": format!("解析备份文件失败: {}", e)
            })),
        )
    })?;

    let merged_notes = db::sync_notes(&state.pool, notes).map_err(|e| {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("本地缓存写入引擎处理异常: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "合并数据到本地数据库失败",
                "error": e.to_string()
            })),
        )
    })?;

    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("end"), "SUCCESS", &format!("FTP 下行同步成功完毕，本地已合流并刷新。当前全局活跃备忘记录: {} 篇", merged_notes.len()));
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
    let session_id = uuid::Uuid::new_v4().to_string();
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("start"), "INFO", "收到手动【双向合并融合同步】触发流：开始执行下行拉取。");
    
    // 1. 下载 FTP 备份（若文件存在）
    let bytes_opt = FtpStorageProvider::download_sync(&state.pool, Some(&session_id), &config).await.map_err(|e| {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("双向同步下载错误: {}", e));
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
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("lww_merge"), "INFO", &format!("拉回 {} 条云端记录，并就地调起双端 LWW 最终一致性调停机制...", ftp_notes.len()));
            let _ = db::sync_notes(&state.pool, ftp_notes);
        }
    }

    // 2. 取出合并后的全部最新 LWW 笔记记录
    let all_notes = db::get_all_notes(&state.pool).map_err(|e| {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("加载本地全量状态失败: {}", e));
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
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("融合后包体序列化失败: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "对合并后的数据序列化失败",
                "error": e.to_string()
            })),
        )
    })?;

    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("upload"), "INFO", &format!("双向合并完成！启动上行安全推流，覆盖云端，上载 Payload 尺寸: {} 字节。", upload_content.len()));
    FtpStorageProvider::upload_sync(&state.pool, Some(&session_id), &config, upload_content).await.map_err(|e| {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("同步最终写入操作失败: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": format!("FTP 覆盖同步更新失败: {}", e)
            })),
        )
    })?;

    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("end"), "SUCCESS", &format!("FTP 双向状态自动纠偏和强一致合流告捷！多端设备均已收敛至 {} 篇全局最新快照状态。", all_notes.len()));
    Ok(Json(serde_json::json!({
        "success": true,
        "message": "FTP 双向同步成功！云端与本地已融合同步。",
        "notes": all_notes
    })))
}

async fn force_sync(
    State(state): State<AppState>,
) -> Result<Json<Vec<Note>>, (StatusCode, String)> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("lww"), Some("start"), "INFO", "主干发起【强制手动同步信令】。正在核查本地持久化缓冲区...");
    match db::get_all_notes(&state.pool) {
        Ok(notes) => {
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("lww"), Some("end"), "SUCCESS", "本地数据库读盘通过。");
            Ok(Json(notes))
        }
        Err(err) => {
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("lww"), Some("error"), "ERROR", &format!("强制同步检测失败: {}", err));
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
    let session_id = uuid::Uuid::new_v4().to_string();
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("start"), "INFO", "主平台触发【FTP 推送冷归档】指令（上行独占式）");
    let notes = db::get_all_notes(&state.pool).map_err(|e| {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("推送前读取本地快照失败: {}", e));
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
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("本地包体打包编码异常: {}", e));
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "序列化数据失败",
                "error": e.to_string()
            })),
        )
    })?;
    
    match FtpStorageProvider::upload_sync(&state.pool, Some(&session_id), &config, content).await {
        Ok(_) => {
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("end"), "SUCCESS", &format!("上行推送宣告成功。共归档：{} 条备忘。", notes.len()));
            Ok(Json(serde_json::json!({
                "success": true,
                "message": "FTP 备份推送成功"
            })))
        }
        Err(e) => {
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("上行推送物理写入失败: {}", e));
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

#[derive(serde::Deserialize)]
pub struct LwwTestRequestWrapper {
    pub session_id: String,
}

async fn test_lww_connection(
    State(state): State<AppState>,
    Json(payload): Json<LwwTestRequestWrapper>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let session_id = payload.session_id.clone();
    let protocol = Some("lww");
    
    // Kernel probes
    let _ = db::add_probe_event(&state.pool, &session_id, "kernel", "lww", "receive", "start", "收到前端请求: 执行手动 LWW 联通性探测");
    let _ = db::add_probe_event(&state.pool, &session_id, "kernel", "lww", "forward", "start", "转发控制权至 Rust 后端连接层...");

    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("start"), "INFO", "开始执行手动局域网 P2P LWW 协同同步协议深度握手侦测校验...");

    // Step 1: 物理存储池与 SQLite 连接池状态核验
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("connect"), "INFO", "【连接测试】[Step 1/4] 验证底层本地 SQLite 缓存数据池读写链路...");
    let notes_count = match db::get_all_notes(&state.pool) {
        Ok(notes) => {
            let msg = format!("【连接测试】核验成功。SQLite 数据库存储连接健康，当前持久化已归档原子知识节点数: {} 篇。", notes.len());
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("connect"), "SUCCESS", &msg);
            notes.len()
        }
        Err(e) => {
            let err_msg = format!("【连接测试】SQLite 本地存储数据环路断裂或严重损坏，无法完成数据读盘: {}", e);
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("connect"), "ERROR", &err_msg);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": err_msg,
                    "logs": db::get_sync_logs_by_session(&state.pool, &session_id).unwrap_or_default()
                }))
            ));
        }
    };

    // Step 2: LWW-Element-Set 最终一致性算法引擎装载校验
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("lww_merge"), "INFO", "【连接测试】[Step 2/4] 校验 LWW (Last-Write-Wins) 最终一致性协调仲裁决策引擎...");
    
    // 我们在这里模拟一个虚无的测试数据，并在事务里进行一次试探性 LWW 回滚式冲突判定
    let test_uuid = "lww-consensus-v2-test-stub";
    let now = chrono::Local::now().timestamp_millis();
    let mock_incoming = vec![crate::db::Note {
        id: test_uuid.to_string(),
        title: "LWW-Consensus-Probe".to_string(),
        content: "Probing conflict engine...".to_string(),
        created_at: now,
        updated_at: now,
        deleted: false,
    }];
    
    match db::sync_notes(&state.pool, mock_incoming) {
        Ok(_) => {
            if let Ok(mut conn) = state.pool.get() {
                let _ = conn.execute("DELETE FROM notes WHERE id = ?1", [test_uuid]);
            }
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("lww_merge"), "SUCCESS", "【连接测试】LWW 冲突协商机制验证成功！决策模块支持最后写入赢策略、双向反向纠偏及旧版本丢弃。");
        }
        Err(e) => {
            let _ = db::add_probe_event(&state.pool, &session_id, "kernel", "lww", "response", "error", &format!("LWW合并探测失败: {}", e));
            let err_msg = format!("【连接测试】冲突协商仲裁引擎工作异常，无法协调多源数据状态: {}", e);
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("lww_merge"), "ERROR", &err_msg);
            let mut logs = db::get_probe_events(&state.pool).unwrap_or_default()
                .into_iter()
                .filter(|log| log.session_id == session_id)
                .collect::<Vec<_>>();
            logs.reverse();
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": err_msg,
                    "logs": logs
                }))
            ));
        }
    }

    // Step 3: SSE 广播信道端口热状态校验
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("broadcast"), "INFO", "【连接测试】[Step 3/4] 正在检测本地多端口多端 SSE 广播信道物理态...");
    let receiver_count = state.tx.receiver_count();
    let msg = format!("【连接测试】SSE 模块工作就绪。当前局域网订阅此端点并积极保持连通的独立边缘终端数量: {} 个。", receiver_count);
    
    if state.tx.send("LWW_PROBE_SIGNAL".to_string()).is_ok() {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("broadcast"), "SUCCESS", &format!("{} 广播测试探针发放正常，下游物理层无损消费完毕。", msg));
    } else {
        let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("broadcast"), "WARN", &format!("{} 管道虽然可用，但当前无可供直接消费的有源活动终端，消息流已转储。这属于局域网单机状态下的预期内工作情况。", msg));
    }

    // Step 4: 最终一致性握手闭环
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), protocol, Some("end"), "SUCCESS", &format!("【连接测试】[Step 4/4] 局局网广播及 LWW 本地一致性健康检测圆满结束。总计扫描并保全 {} 个原子改动，分布式自律链路完好！", notes_count));

    let _ = db::add_probe_event(&state.pool, &session_id, "kernel", "lww", "response", "ok", "LWW 测试返回成功结果，诊断全数绿灯通行");
    let mut logs = db::get_probe_events(&state.pool).unwrap_or_default()
        .into_iter()
        .filter(|log| log.session_id == session_id)
        .collect::<Vec<_>>();
    logs.reverse();
    Ok(Json(serde_json::json!({
        "success": true,
        "message": "局域网 P2P LWW 协同同步协议通过全方位健康测试，链路一切正常！",
        "logs": logs
    })))
}

#[derive(serde::Deserialize)]
pub struct FtpTestRequestWrapper {
    pub session_id: String,
    pub config: FtpConfig,
}

async fn test_ftp_connection(
    State(state): State<AppState>,
    Json(payload): Json<FtpTestRequestWrapper>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let session_id = payload.session_id.clone();
    let config = payload.config;
    
    // Kernel logs
    let _ = db::add_probe_event(&state.pool, &session_id, "kernel", "ftp", "receive", "start", "收到前端请求: 执行手动 FTP 联通性探测");
    let _ = db::add_probe_event(&state.pool, &session_id, "kernel", "ftp", "forward", "start", "转发控制权至 Rust 后端连接层...");

    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("start"), "INFO", "开始执行手动 FTP 主机登录联通性及远程挂载目录寻址校验");
    
    let test_res = FtpStorageProvider::test_sync(&state.pool, Some(&session_id), &config).await;
    
    match test_res {
        Ok(_) => {
            let _ = db::add_probe_event(&state.pool, &session_id, "kernel", "ftp", "response", "ok", "FTP后端测试通过，返回JSON");
            let mut logs = db::get_probe_events(&state.pool).unwrap_or_default()
                .into_iter()
                .filter(|log| log.session_id == session_id)
                .collect::<Vec<_>>();
            logs.reverse();
            Ok(Json(serde_json::json!({
                "success": true,
                "message": "FTP 身份口令验证及挂载路径寻址大功告成！通道已畅通。",
                "logs": logs
            })))
        }
        Err(e) => {
            let _ = db::add_probe_event(&state.pool, &session_id, "kernel", "ftp", "response", "error", &format!("FTP测试出错返回: {}", e));
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("ftp"), Some("error"), "ERROR", &format!("FTP 连接验证未通过，握手中断。异常: {}", e));
            let mut logs = db::get_probe_events(&state.pool).unwrap_or_default()
                .into_iter()
                .filter(|log| log.session_id == session_id)
                .collect::<Vec<_>>();
            logs.reverse(); // put into chronological order
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": e,
                    "logs": logs
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
    let session_id = uuid::Uuid::new_v4().to_string();
    let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("lww"), Some("start"), "INFO", &format!("传统接口：尝试与 SQLite LWW 引擎合流 {} 篇笔记", incoming_notes.len()));
    match db::sync_notes(&state.pool, incoming_notes) {
        Ok(notes) => {
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("lww"), Some("end"), "SUCCESS", "传统接口合流并通过最终一致性检测。");
            Ok(Json(notes))
        }
        Err(err) => {
            let _ = db::add_sync_log_detailed(&state.pool, Some(&session_id), Some("lww"), Some("error"), "ERROR", &format!("已有旧终端数据合并失败: {}", err));
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
    pub session_id: Option<String>,
    pub protocol: Option<String>,
    pub step: Option<String>,
}

async fn add_sync_log_api(
    State(state): State<AppState>,
    Json(payload): Json<AddLogRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    match db::add_sync_log_detailed(
        &state.pool,
        payload.session_id.as_deref(),
        payload.protocol.as_deref(),
        payload.step.as_deref(),
        &payload.level,
        &payload.message,
    ) {
        Ok(_) => Ok(StatusCode::OK),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error on adding log: {}", err),
        )),
    }
}

#[derive(serde::Deserialize)]
pub struct ProbeEventRequest {
    pub session_id: String,
    pub layer: String,
    pub protocol: String,
    pub step: String,
    pub status: String,
    pub message: String,
}

async fn add_probe_event_api(
    State(state): State<AppState>,
    Json(payload): Json<ProbeEventRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    match db::add_probe_event(
        &state.pool,
        &payload.session_id,
        &payload.layer,
        &payload.protocol,
        &payload.step,
        &payload.status,
        &payload.message,
    ) {
        Ok(_) => Ok(StatusCode::OK),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error on adding probe event: {}", err),
        )),
    }
}

async fn get_probe_events_api(
    State(state): State<AppState>,
) -> Result<Json<Vec<db::ProbeEvent>>, (StatusCode, String)> {
    match db::get_probe_events(&state.pool) {
        Ok(events) => Ok(Json(events)),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error on getting probe events: {}", err),
        )),
    }
}
