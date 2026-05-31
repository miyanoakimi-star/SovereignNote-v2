use axum::{
    extract::State,
    http::StatusCode,
    Json,
    routing::{get, post},
    Router,
};
use crate::db::{self, DbPool, Note};

pub fn router(pool: DbPool) -> Router {
    Router::new()
        .route("/notes", get(get_notes))
        .route("/notes/sync", post(sync_notes))
        .with_state(pool)
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
