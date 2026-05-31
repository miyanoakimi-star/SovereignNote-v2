use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::fs;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_db() -> Result<DbPool, r2d2::Error> {
    // 确保物理落盘目录存在
    fs::create_dir_all("./sovereign_data").unwrap();
    
    let manager = SqliteConnectionManager::file("./sovereign_data/sovereign.db");
    let pool = Pool::builder()
        .max_size(10) // 高并发场景下控制最大并发句柄
        .build(manager)?;

    // 获取并执行 DDL 初始化脚本
    let conn = pool.get().unwrap();
    schema_up(&conn).expect("DDL Execution Failed");

    Ok(pool)
}

fn schema_up(conn: &Connection) -> rusqlite::Result<()> {
    // 执行原子化表结构拉起
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;          -- 开启 WAL 模式提升高吞吐写性能
        PRAGMA synchronous = NORMAL;        -- 兼顾铁血落盘与性能
        PRAGMA foreign_keys = ON;

        -- 核心笔记表 (Notes)
        CREATE TABLE IF NOT EXISTS notes (
            uuid TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,          -- Markdown 实体
            category_id TEXT,
            updated_at INTEGER NOT NULL,    -- 毫秒级时间戳，用于 LWW
            created_at INTEGER NOT NULL
        );

        -- 二进制资产表 (Assets) (可选：可直接存储在物理文件系统中，这里展示落盘表结构)
        CREATE TABLE IF NOT EXISTS assets (
            uuid TEXT PRIMARY KEY,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            physical_path TEXT NOT NULL,    -- 存储在本地文件系统的相对路径
            created_at INTEGER NOT NULL
        );

        -- 标签树表 (Tags)
        CREATE TABLE IF NOT EXISTS tags (
            auto_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );
        "#,
    )?;
    Ok(())
}
