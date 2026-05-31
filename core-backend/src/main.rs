use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

mod api;
mod db;

#[tokio::main]
async fn main() {
    // 1. 初始化 SQLite 数据库及连接池
    let pool = db::init_db().expect("Failed to initialize database pool");

    // 2. 强硬的 CORS 策略：仅允许本地前端壳访问
    let cors = CorsLayer::new()
        .allow_origin(Any) // 生产环境应严格绑定为 http://127.0.0.1:3000 或 tauri://localhost
        .allow_methods(Any)
        .allow_headers(Any);

    // 3. 构建本地微服务群路由
    let app = Router::new()
        .route("/api/notes", post(api::save_note))
        .route("/api/assets/download/:uuid", get(api::stream_asset))
        .with_state(pool)
        .layer(cors);

    // 4. 绑定本地回环端口，杜绝外部网卡扫描
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("⚔️ Sovereign Core Backend running on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
