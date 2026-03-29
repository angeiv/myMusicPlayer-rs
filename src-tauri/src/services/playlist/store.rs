use std::path::Path;

use anyhow::{Context, Result, anyhow};
use chrono::{TimeZone, Utc};
use rusqlite::{Connection, params};
use uuid::Uuid;

use crate::models::Playlist;

pub struct PlaylistStore {
    conn: Connection,
}

impl PlaylistStore {
    pub fn open(path: &Path) -> Result<Self> {
        let mut conn = Connection::open(path).context("Failed to open playlist database")?;
        initialize_schema(&mut conn)?;
        Ok(Self { conn })
    }

    pub fn open_in_memory() -> Result<Self> {
        let mut conn =
            Connection::open_in_memory().context("Failed to open in-memory playlist database")?;
        initialize_schema(&mut conn)?;
        Ok(Self { conn })
    }

    pub fn load_all(&self) -> Result<Vec<Playlist>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT id, name, description, date_added, COALESCE(updated_at, date_added) AS updated_at
            FROM playlists
            ORDER BY lower(name)
            "#,
        )?;

        let mut rows = stmt.query([])?;
        let mut playlists = Vec::new();
        while let Some(row) = rows.next()? {
            let id_text: String = row.get("id")?;
            let id = Uuid::parse_str(&id_text)
                .with_context(|| format!("Invalid playlist UUID stored in database: {id_text}"))?;
            let created_at_ts: i64 = row.get("date_added")?;
            let updated_at_ts: i64 = row.get("updated_at")?;

            let mut playlist = Playlist {
                id,
                name: row.get("name")?,
                description: row.get("description")?,
                track_ids: self.load_track_ids(&id)?,
                artwork: None,
                created_at: timestamp_to_utc(created_at_ts)?,
                updated_at: timestamp_to_utc(updated_at_ts)?,
            };

            if playlist.updated_at < playlist.created_at {
                playlist.updated_at = playlist.created_at;
            }

            playlists.push(playlist);
        }

        Ok(playlists)
    }

    pub fn save_playlist(&mut self, playlist: &Playlist) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute(
            r#"
            INSERT INTO playlists (id, name, description, date_added, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                updated_at = excluded.updated_at
            "#,
            params![
                playlist.id.to_string(),
                playlist.name,
                playlist.description,
                playlist.created_at.timestamp(),
                playlist.updated_at.timestamp(),
            ],
        )?;

        tx.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist.id.to_string()],
        )?;

        for (position, track_id) in playlist.track_ids.iter().enumerate() {
            tx.execute(
                r#"
                INSERT INTO playlist_tracks (playlist_id, track_id, position)
                VALUES (?1, ?2, ?3)
                "#,
                params![
                    playlist.id.to_string(),
                    track_id.to_string(),
                    position as i64
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn delete_playlist(&self, playlist_id: &Uuid) -> Result<()> {
        self.conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id.to_string()],
        )?;
        self.conn.execute(
            "DELETE FROM playlists WHERE id = ?1",
            params![playlist_id.to_string()],
        )?;
        Ok(())
    }

    fn load_track_ids(&self, playlist_id: &Uuid) -> Result<Vec<Uuid>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT track_id
            FROM playlist_tracks
            WHERE playlist_id = ?1
            ORDER BY position ASC
            "#,
        )?;

        let mut rows = stmt.query(params![playlist_id.to_string()])?;
        let mut track_ids = Vec::new();
        while let Some(row) = rows.next()? {
            let track_id_text: String = row.get(0)?;
            let track_id = Uuid::parse_str(&track_id_text).with_context(|| {
                format!("Invalid track UUID stored in database: {track_id_text}")
            })?;
            track_ids.push(track_id);
        }

        Ok(track_ids)
    }
}

fn initialize_schema(conn: &mut Connection) -> Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            date_added INTEGER NOT NULL,
            updated_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id TEXT NOT NULL,
            track_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, position)
        );

        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_position
            ON playlist_tracks (playlist_id, position);
        "#,
    )?;

    ensure_updated_at_column(conn)?;
    Ok(())
}

fn ensure_updated_at_column(conn: &Connection) -> Result<()> {
    let has_updated_at = conn
        .prepare("PRAGMA table_info(playlists)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?
        .into_iter()
        .any(|name| name == "updated_at");

    if !has_updated_at {
        conn.execute("ALTER TABLE playlists ADD COLUMN updated_at INTEGER", [])?;
    }

    conn.execute(
        "UPDATE playlists SET updated_at = date_added WHERE updated_at IS NULL",
        [],
    )?;

    Ok(())
}

fn timestamp_to_utc(value: i64) -> Result<chrono::DateTime<Utc>> {
    Utc.timestamp_opt(value, 0)
        .single()
        .ok_or_else(|| anyhow!("Invalid UTC timestamp stored in playlist database: {value}"))
}
