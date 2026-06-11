use axum::{
    routing::get,
    Router,
    response::IntoResponse,
    http::{StatusCode, header, Uri},
};
use rust_embed::RustEmbed;
use mime_guess::from_path;
use tower_http::cors::{CorsLayer, Any};

mod db;
mod api;
mod ftp;
pub mod lww;
pub mod kernel;
pub mod backup;

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

use std::path::PathBuf;
use std::fs::OpenOptions;
use std::io::Write;

fn get_exe_dir() -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            return parent.to_path_buf();
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn log_to_file(level: &str, msg: &str) {
    let mut path = get_exe_dir();
    path.push("sovereign_backend.log");
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let log_line = format!("[{}] [{}] {}\n", timestamp, level, msg);
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = file.write_all(log_line.as_bytes());
    }
}

fn print_and_log(level: &str, msg: &str) {
    println!("[{}] {}", level, msg);
    log_to_file(level, msg);
}

fn setup_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        let msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            *s
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.as_str()
        } else {
            "Unknown panic"
        };
        
        let location = if let Some(loc) = panic_info.location() {
            format!("at {}:{}", loc.file(), loc.line())
        } else {
            "unknown location".to_string()
        };
        
        let error_msg = format!("PANIC occurred: {} ({})", msg, location);
        eprintln!("{}", error_msg);
        log_to_file("FATAL", &error_msg);
    }));
}

#[tokio::main]
async fn main() {
    setup_panic_hook();
    print_and_log("INFO", "=== Sovereign Backend Engine Starting Up ===");
    print_and_log("INFO", "Initializing Sovereign Backend DB...");
    
    let mut db_path = get_exe_dir();
    db_path.push("sovereign_note.db");
    print_and_log("INFO", &format!("Database path resolved: {:?}", db_path));
    
    // 初始化本地 SQLite (数据库文件名：sovereign_note.db)，并具备对损坏/表锁定的自恢复自我修复能力
    let pool = match db::init_db(&db_path) {
        Ok(p) => {
            print_and_log("INFO", "Database loaded successfully on primary connection path.");
            p
        }
        Err(e) => {
            print_and_log("ERROR", &format!("Primary database load failed: {}. Initiating self-healing engine...", e));
            // Back up the corrupted/locked database file
            let timestamp = chrono::Local::now().format("%Y%m%d%H%M%S").to_string();
            let mut backup_path = get_exe_dir();
            backup_path.push(format!("sovereign_note.db.corrupted-{}", timestamp));
            
            if db_path.exists() {
                print_and_log("WARN", &format!("Archiving current database file to: {:?}", backup_path));
                if let Err(rename_err) = std::fs::rename(&db_path, &backup_path) {
                    print_and_log("ERROR", &format!("Failed to rename/archive existing database: {}. Performing raw deletions...", rename_err));
                    let _ = std::fs::remove_file(&db_path);
                }
            }
            
            // Re-init with clean file
            print_and_log("INFO", "Re-attempting fresh database initialization schema...");
            match db::init_db(&db_path) {
                Ok(new_pool) => {
                    print_and_log("INFO", "Self-healing completed! Fresh sovereign_note.db successfully initialized.");
                    new_pool
                }
                Err(e2) => {
                    let fatal_error_msg = format!("CRITICAL ERROR: Failed to form SQLite connection even from fresh database! Details: {}", e2);
                    print_and_log("FATAL", &fatal_error_msg);
                    panic!("{}", fatal_error_msg);
                }
            }
        }
    };

    let (tx, _) = tokio::sync::broadcast::channel::<String>(100);
    
    let logger = kernel::LogBus {
        pool: pool.clone(),
        sse: tx.clone()
    };
    let mut kernel_instance = kernel::Kernel::new(logger);
    kernel_instance.boot().await;
    let kernel_arc = std::sync::Arc::new(tokio::sync::Mutex::new(kernel_instance));

    let app_state = api::AppState {
        pool: pool.clone(),
        tx,
        kernel: kernel_arc,
    };

    // 注册挂载的 API 路由集，嵌套在 /api
    let api_routes = api::router(app_state);

    // 配置 CORS 允许跨域（移动端和局域网多端同步必备）
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // 构建应用
    let app = Router::new()
        .nest("/api", api_routes)
        // 使用 fallback 挂载前端静态资源与 SPA 接管逻辑
        .fallback(fallback_handler)
        .layer(cors);

    // 绑定端口 3000 (支持容器环境与本地调试)
    print_and_log("INFO", "Attempting to bind TcpListener on 0.0.0.0:3000...");
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    print_and_log("INFO", "Server successfully running on http://0.0.0.0:3000");
    axum::serve(listener, app).await.unwrap();
}
