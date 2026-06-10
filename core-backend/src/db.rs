use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncLog {
    pub id: Option<i64>,
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub session_id: Option<String>,
    pub protocol: Option<String>,
    pub step: Option<String>,
}

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn init_db<P: AsRef<Path>>(db_path: P) -> DbPool {
    let manager = SqliteConnectionManager::file(db_path);
    let pool = Pool::builder()
        .max_size(10)
        .build(manager)
        .expect("Failed to create SQLite connection pool");

    let conn = pool.get().expect("Failed to get DB connection");
    
    // 初始化具有 LWW tombstone 删除状态标志的 notes 数据库表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            deleted INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )
    .expect("Failed to initialize database tables");

    // Drop then recreate table to ensure new columns (session_id, protocol, step) exist
    let _ = conn.execute("DROP TABLE IF EXISTS sync_logs", []);
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            session_id TEXT,
            protocol TEXT,
            step TEXT
        )",
        [],
    )
    .expect("Failed to initialize sync_logs table");

    pool
}

pub fn add_sync_log(pool: &DbPool, level: &str, message: &str) -> Result<(), rusqlite::Error> {
    add_sync_log_detailed(pool, None, None, None, level, message)
}

pub fn add_sync_log_detailed(
    pool: &DbPool,
    session_id: Option<&str>,
    protocol: Option<&str>,
    step: Option<&str>,
    level: &str,
    message: &str,
) -> Result<(), rusqlite::Error> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO sync_logs (timestamp, level, message, session_id, protocol, step) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![timestamp, level, message, session_id, protocol, step],
    )?;

    // 限制最近的1000条，循环保留最新
    conn.execute(
        "DELETE FROM sync_logs WHERE id NOT IN (
            SELECT id FROM sync_logs ORDER BY id DESC LIMIT 1000
        )",
        [],
    )?;

    Ok(())
}

pub fn get_sync_logs(pool: &DbPool) -> Result<Vec<SyncLog>, rusqlite::Error> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare("SELECT id, timestamp, level, message, session_id, protocol, step FROM sync_logs ORDER BY id DESC")?;
    let logs_iter = stmt.query_map([], |row| {
        Ok(SyncLog {
            id: Some(row.get(0)?),
            timestamp: row.get(1)?,
            level: row.get(2)?,
            message: row.get(3)?,
            session_id: row.get(4)?,
            protocol: row.get(5)?,
            step: row.get(6)?,
        })
    })?;

    let mut logs = Vec::new();
    for log in logs_iter {
        logs.push(log?);
    }
    Ok(logs)
}

pub fn get_sync_logs_by_session(pool: &DbPool, session_id: &str) -> Result<Vec<SyncLog>, rusqlite::Error> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare("SELECT id, timestamp, level, message, session_id, protocol, step FROM sync_logs WHERE session_id = ?1 ORDER BY id ASC")?;
    let logs_iter = stmt.query_map([session_id], |row| {
        Ok(SyncLog {
            id: Some(row.get(0)?),
            timestamp: row.get(1)?,
            level: row.get(2)?,
            message: row.get(3)?,
            session_id: row.get(4)?,
            protocol: row.get(5)?,
            step: row.get(6)?,
        })
    })?;

    let mut logs = Vec::new();
    for log in logs_iter {
        logs.push(log?);
    }
    Ok(logs)
}

pub fn clear_sync_logs(pool: &DbPool) -> Result<(), rusqlite::Error> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute("DELETE FROM sync_logs", [])?;
    Ok(())
}

pub fn get_all_notes(pool: &DbPool) -> Result<Vec<Note>, rusqlite::Error> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare("SELECT id, title, content, created_at, updated_at, deleted FROM notes")?;
    let notes_iter = stmt.query_map([], |row| {
        let deleted_val: i32 = row.get(5)?;
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            deleted: deleted_val != 0,
        })
    })?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note?);
    }
    Ok(notes)
}

pub fn sync_notes(pool: &DbPool, incoming_notes: Vec<Note>) -> Result<Vec<Note>, rusqlite::Error> {
    let mut conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let tx = conn.transaction()?;

    for note in incoming_notes {
        // 先查询现有记录，进行 LWW 合并算法：Last-Write-Wins 仅在传入的 updated_at 大于等于现有记录时进行 upsert
        let mut existing_opt: Option<(i64, i32)> = None;
        {
            let mut stmt = tx.prepare("SELECT updated_at, deleted FROM notes WHERE id = ?1")?;
            let mut rows = stmt.query(params![note.id])?;
            if let Some(row) = rows.next()? {
                existing_opt = Some((row.get(0)?, row.get(1)?));
            }
        }

        match existing_opt {
            Some((existing_updated_at, _)) => {
                // 只有当 incoming 时间戳大于现存时间戳时，才覆盖更新 (Last-Write-Wins)
                if note.updated_at > existing_updated_at {
                    tx.execute(
                        "UPDATE notes SET title = ?1, content = ?2, created_at = ?3, updated_at = ?4, deleted = ?5 WHERE id = ?6",
                        params![
                            note.title,
                            note.content,
                            note.created_at,
                            note.updated_at,
                            if note.deleted { 1 } else { 0 },
                            note.id
                        ],
                    )?;
                }
            }
            None => {
                // 如果不存在，则直接插入
                tx.execute(
                    "INSERT INTO notes (id, title, content, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        note.id,
                        note.title,
                        note.content,
                        note.created_at,
                        note.updated_at,
                        if note.deleted { 1 } else { 0 }
                    ],
                )?;
            }
        }
    }

    tx.commit()?;

    // 重新拉取合并处理后的全部数据，反馈回客户端 (进行两端完全对等的数据合流)
    get_all_notes(pool)
}

pub fn update_note(pool: &DbPool, note: Note) -> Result<Note, rusqlite::Error> {
    let mut conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let tx = conn.transaction()?;

    let mut existing_opt: Option<(i64, i32)> = None;
    {
        let mut stmt = tx.prepare("SELECT updated_at, deleted FROM notes WHERE id = ?1")?;
        let mut rows = stmt.query(params![note.id])?;
        if let Some(row) = rows.next()? {
            existing_opt = Some((row.get(0)?, row.get(1)?));
        }
    }

    match existing_opt {
        Some((existing_updated_at, _)) => {
            if note.updated_at > existing_updated_at {
                tx.execute(
                    "UPDATE notes SET title = ?1, content = ?2, created_at = ?3, updated_at = ?4, deleted = ?5 WHERE id = ?6",
                    params![
                        note.title,
                        note.content,
                        note.created_at,
                        note.updated_at,
                        if note.deleted { 1 } else { 0 },
                        note.id
                    ],
                )?;
            }
        }
        None => {
            tx.execute(
                "INSERT INTO notes (id, title, content, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    note.id,
                    note.title,
                    note.content,
                    note.created_at,
                    note.updated_at,
                    if note.deleted { 1 } else { 0 }
                ],
            )?;
        }
    }

    tx.commit()?;

    // 取出最新的以返回
    let conn2 = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn2.prepare("SELECT id, title, content, created_at, updated_at, deleted FROM notes WHERE id = ?1")?;
    let mut rows = stmt.query(params![note.id])?;
    if let Some(row) = rows.next()? {
        let deleted_val: i32 = row.get(5)?;
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            deleted: deleted_val != 0,
        })
    } else {
        Ok(note)
    }
}
