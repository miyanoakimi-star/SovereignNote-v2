use axum::{
    routing::get,
    Router,
    response::IntoResponse,
    http::{StatusCode, header, Uri},
};
use rust_embed::RustEmbed;
use mime_guess::from_path;

mod db;
mod api;
mod ftp;

#[derive(RustEmbed)]
#[folder = "../dist"] // 指向前端 Vite 构建产物
struct FrontendAssets;

/// 通配路由：拦截静态资源请求与 SPA 视图回退
async fn fallback_handler(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    
    // 如果请求根路径，默认指向 index.html
    let path = if path.is_empty() { "index.html" } else { path };

    // 优先尝试从被嵌的资源中获取该路径的文件内容
    match FrontendAssets::get(path) {
        Some(content) => {
            // 获取到了具体静态文件 (例如 .js, .css, 图标等)
            let mime = from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
        }
        None => {
            // 如果文件不存在，且不属于后台 /api/ 开头的请求，则接管前台路由（回退吐出 index.html）
            if !path.starts_with("api/") {
                match FrontendAssets::get("index.html") {
                    Some(content) => {
                        let mime = from_path("index.html").first_or_octet_stream();
                        ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
                    }
                    None => (StatusCode::NOT_FOUND, "前端资源缺失，请先运行前端 Build").into_response(),
                }
            } else {
                // 如果是 API 请求却走到这里，那就是 404 API NotFound
                (StatusCode::NOT_FOUND, "API Endpoint Not Found").into_response()
            }
        }
    }
}

async fn health_check() -> &'static str {
    "Backend API is alive!"
}

#[tokio::main]
async fn main() {
    println!("Initializing Sovereign Backend DB...");
    
    // 初始化本地 SQLite (数据库文件名：sovereign_note.db)
    let pool = db::init_db("sovereign_note.db");

    // 注册挂载的 API 路由集，嵌套在 /api
    let api_routes = api::router(pool)
        .route("/health", get(health_check));

    // 构建应用
    let app = Router::new()
        .nest("/api", api_routes)
        // 使用 fallback 挂载前端静态资源与 SPA 接管逻辑
        .fallback(fallback_handler);

    // 绑定端口 3000 (支持容器环境与本地调试)
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server successfully running on http://0.0.0.0:3000");
    axum::serve(listener, app).await.unwrap();
}
