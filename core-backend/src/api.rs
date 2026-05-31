use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use crate::db::DbPool;

#[derive(Deserialize, Serialize, Clone)]
pub struct NotePayload {
    pub uuid: String,
    pub title: String,
    pub content: String,
    pub updated_at: i64,
}

/// 【主权笔记安全落盘流】
/// 原子化保存：基于 SQLite 事务（Transaction），杜绝中途被打断导致的数据损坏
pub async fn save_note(
    State(pool): State<DbPool>,
    Json(payload): Json<NotePayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // 1. 获取一个数据库独占连接
    let mut conn = pool.get().map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to get db connection: {}", e))
    })?;

    // 2. 启动原生 SQLite 事务作用域 (跨越线程阻塞防线)
    let tx = conn.transaction().map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to start transaction: {}", e))
    })?;

    // 3. 执行安全的 Upsert 操作 (Last-Write-Wins 初步判断可基于 updated_at 追加)
    match tx.execute(
        "INSERT INTO notes (uuid, title, content, updated_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(uuid) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         updated_at = excluded.updated_at
         WHERE excluded.updated_at > notes.updated_at", // LWW 时间戳卫语句
        (
            &payload.uuid,
            &payload.title,
            &payload.content,
            &payload.updated_at,
        ),
    ) {
        Ok(_) => {
            // 4. 完美无异常，提交事务瞬间落盘
            tx.commit().unwrap();
            Ok((StatusCode::OK, Json(serde_json::json!({ "status": "success", "uuid": payload.uuid }))))
        }
        Err(e) => {
            // 如遇硬盘空间满、只读锁等异常，事务将自动回滚 (tx 被 Drop)
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Tx aborted: {}", e)))
        }
    }
}

/// 【二进制多媒体附件高能流式渲染】
/// 直接将物理文件流式 Pump 到前端浏览器缓存池，杜绝前端 URL.createObjectURL() OOM
pub async fn stream_asset(
    Path(uuid): Path<String>,
) -> impl IntoResponse {
    // 物理路径映射策略 (此为演示，实战中可从 assets 表查出 physical_path)
    let safe_path = format!("./sovereign_data/assets/{}.jpg", uuid);

    // 以异步方式打开物理光盘文件
    match File::open(&safe_path).await {
        Ok(file) => {
            // 使用 tokio-util 的 ReaderStream 进行背压流化 (Backpressure Stream)
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            // 附加强势的 HTTP 缓存头与类型
            (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, "image/jpeg"),
                    (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
                ],
                body,
            ).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "Asset missing".to_string()).into_response(),
    }
}
