//! Library service backed by SQLite for managing normalized music metadata.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow};
use chrono::{TimeZone, Utc};
use lofty::{
    file::AudioFile,
    prelude::{ItemKey, TaggedFileExt},
    read_from_path,
    tag::Accessor,
};
use log::{info, warn};
use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::models::{Album, Artist, Track};
use crate::utils;

const DB_FILE_NAME: &str = "library.sqlite";

/// Raw metadata decoded from an audio file before persistence.
#[derive(Debug)]
struct ExtractedTrack {
    title: String,
    duration: u32,
    track_number: Option<u32>,
    disc_number: Option<u32>,
    file_path: PathBuf,
    size: u64,
    format: String,
    bitrate: u32,
    sample_rate: u32,
    channels: u16,
    artist_name: Option<String>,
    album_artist_name: Option<String>,
    album_title: Option<String>,
    year: Option<i32>,
    genre: Option<String>,
}

/// Service responsible for scanning the filesystem and persisting music metadata.
pub struct LibraryService {
    conn: Connection,
}

impl LibraryService {
    /// Create a new library service backed by a sqlite database stored under
    /// the application's data directory.
    pub fn new() -> Result<Self> {
        let db_path = default_database_path()?;
        let mut conn = Connection::open(db_path).context("Failed to open library database")?;
        initialize_schema(&mut conn)?;
        Ok(Self { conn })
    }

    /// Scan a directory recursively and persist the discovered audio metadata.
    pub fn scan_directory<P: AsRef<Path>>(&mut self, path: P) -> Result<usize> {
        let path = path.as_ref();

        if !path.exists() {
            return Err(anyhow!("Path does not exist: {}", path.display()));
        }

        if !path.is_dir() {
            return Err(anyhow!("Path is not a directory: {}", path.display()));
        }

        info!("Scanning directory: {}", path.display());

        let audio_files: Vec<PathBuf> = WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_file())
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(is_supported_extension)
                    .unwrap_or(false)
            })
            .map(|entry| entry.path().to_path_buf())
            .collect();

        let mut inserted = 0usize;
        let tx = self.conn.transaction()?;

        for file_path in audio_files {
            match extract_metadata(&file_path) {
                Ok(raw) => match persist_track(&tx, raw) {
                    Ok(created_new) => {
                        if created_new {
                            inserted += 1;
                        }
                    }
                    Err(err) => {
                        warn!(
                            "Failed to persist metadata for {}: {}",
                            file_path.display(),
                            err
                        );
                    }
                },
                Err(err) => warn!(
                    "Failed to read metadata for {}: {}",
                    file_path.display(),
                    err
                ),
            }
        }

        tx.commit()?;
        Ok(inserted)
    }

    /// Retrieve all tracks currently stored in the library.
    pub fn get_tracks(&self) -> Result<Vec<Track>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                t.id,
                t.title,
                t.duration,
                t.track_number,
                t.disc_number,
                t.file_path,
                t.size,
                t.format,
                t.bitrate,
                t.sample_rate,
                t.channels,
                t.artist_id,
                ar.name as artist_name,
                t.album_artist_id,
                aar.name as album_artist_name,
                t.album_id,
                al.title as album_title,
                t.year,
                t.genre,
                t.play_count,
                t.last_played,
                t.date_added
            FROM tracks t
            LEFT JOIN artists ar ON ar.id = t.artist_id
            LEFT JOIN artists aar ON aar.id = t.album_artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            ORDER BY lower(t.title)
            "#,
        )?;

        let mut tracks = Vec::new();
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            tracks.push(row_to_track(row)?);
        }
        Ok(tracks)
    }

    /// Retrieve a single track by identifier.
    pub fn get_track(&self, id: Uuid) -> Result<Option<Track>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                t.id,
                t.title,
                t.duration,
                t.track_number,
                t.disc_number,
                t.file_path,
                t.size,
                t.format,
                t.bitrate,
                t.sample_rate,
                t.channels,
                t.artist_id,
                ar.name as artist_name,
                t.album_artist_id,
                aar.name as album_artist_name,
                t.album_id,
                al.title as album_title,
                t.year,
                t.genre,
                t.play_count,
                t.last_played,
                t.date_added
            FROM tracks t
            LEFT JOIN artists ar ON ar.id = t.artist_id
            LEFT JOIN artists aar ON aar.id = t.album_artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE t.id = ?1
            "#,
        )?;

        let mut rows = stmt.query([id.to_string()])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_track(row)?))
        } else {
            Ok(None)
        }
    }

    /// Retrieve all albums with aggregated metadata.
    pub fn get_albums(&self) -> Result<Vec<Album>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                al.id,
                al.title,
                al.artist_id,
                ar.name as artist_name,
                al.year,
                al.genre,
                al.cover_art_path,
                al.date_added,
                COUNT(t.id) as track_count,
                IFNULL(SUM(t.duration), 0) as duration
            FROM albums al
            LEFT JOIN artists ar ON ar.id = al.artist_id
            LEFT JOIN tracks t ON t.album_id = al.id
            GROUP BY al.id
            ORDER BY lower(al.title)
            "#,
        )?;

        let mut albums = Vec::new();
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            albums.push(row_to_album(row)?);
        }
        Ok(albums)
    }

    /// Retrieve a single album by identifier.
    pub fn get_album(&self, id: Uuid) -> Result<Option<Album>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                al.id,
                al.title,
                al.artist_id,
                ar.name as artist_name,
                al.year,
                al.genre,
                al.cover_art_path,
                al.date_added,
                COUNT(t.id) as track_count,
                IFNULL(SUM(t.duration), 0) as duration
            FROM albums al
            LEFT JOIN artists ar ON ar.id = al.artist_id
            LEFT JOIN tracks t ON t.album_id = al.id
            WHERE al.id = ?1
            GROUP BY al.id
            "#,
        )?;

        let mut rows = stmt.query([id.to_string()])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_album(row)?))
        } else {
            Ok(None)
        }
    }

    /// Retrieve all artists with aggregated counts.
    pub fn get_artists(&self) -> Result<Vec<Artist>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                ar.id,
                ar.name,
                ar.bio,
                ar.date_added,
                COUNT(DISTINCT al.id) as album_count,
                COUNT(t.id) as track_count
            FROM artists ar
            LEFT JOIN albums al ON al.artist_id = ar.id
            LEFT JOIN tracks t ON t.artist_id = ar.id
            GROUP BY ar.id
            ORDER BY lower(ar.name)
            "#,
        )?;

        let mut artists = Vec::new();
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            artists.push(row_to_artist(row)?);
        }
        Ok(artists)
    }

    /// Retrieve a single artist by identifier.
    pub fn get_artist(&self, id: Uuid) -> Result<Option<Artist>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                ar.id,
                ar.name,
                ar.bio,
                ar.date_added,
                COUNT(DISTINCT al.id) as album_count,
                COUNT(t.id) as track_count
            FROM artists ar
            LEFT JOIN albums al ON al.artist_id = ar.id
            LEFT JOIN tracks t ON t.artist_id = ar.id
            WHERE ar.id = ?1
            GROUP BY ar.id
            "#,
        )?;

        let mut rows = stmt.query([id.to_string()])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_artist(row)?))
        } else {
            Ok(None)
        }
    }

    /// Retrieve tracks filtered by album identifier.
    pub fn get_tracks_by_album(&self, album_id: &Uuid) -> Result<Vec<Track>> {
        query_tracks_with_condition(&self.conn, "t.album_id = ?1", params![album_id.to_string()])
    }

    /// Retrieve tracks filtered by artist identifier.
    pub fn get_tracks_by_artist(&self, artist_id: &Uuid) -> Result<Vec<Track>> {
        query_tracks_with_condition(
            &self.conn,
            "t.artist_id = ?1",
            params![artist_id.to_string()],
        )
    }

    /// Retrieve albums for a given artist.
    pub fn get_albums_by_artist(&self, artist_id: &Uuid) -> Result<Vec<Album>> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                al.id,
                al.title,
                al.artist_id,
                ar.name as artist_name,
                al.year,
                al.genre,
                al.cover_art_path,
                al.date_added,
                COUNT(t.id) as track_count,
                IFNULL(SUM(t.duration), 0) as duration
            FROM albums al
            LEFT JOIN artists ar ON ar.id = al.artist_id
            LEFT JOIN tracks t ON t.album_id = al.id
            WHERE al.artist_id = ?1
            GROUP BY al.id
            ORDER BY lower(al.title)
            "#,
        )?;

        let mut albums = Vec::new();
        let mut rows = stmt.query([artist_id.to_string()])?;
        while let Some(row) = rows.next()? {
            albums.push(row_to_album(row)?);
        }
        Ok(albums)
    }

    /// Perform a simple case-insensitive search across tracks, albums, and artists.
    pub fn search(&self, query: &str) -> Result<(Vec<Track>, Vec<Album>, Vec<Artist>)> {
        if query.trim().is_empty() {
            return Ok((Vec::new(), Vec::new(), Vec::new()));
        }

        let like = format!("%{}%", query.to_lowercase());

        let tracks = query_tracks_with_condition(
            &self.conn,
            "lower(t.title) LIKE ?1 OR lower(ar.name) LIKE ?1 OR lower(al.title) LIKE ?1",
            params![&like],
        )?;

        let mut album_stmt = self.conn.prepare(
            r#"
            SELECT
                al.id,
                al.title,
                al.artist_id,
                ar.name as artist_name,
                al.year,
                al.genre,
                al.cover_art_path,
                al.date_added,
                COUNT(t.id) as track_count,
                IFNULL(SUM(t.duration), 0) as duration
            FROM albums al
            LEFT JOIN artists ar ON ar.id = al.artist_id
            LEFT JOIN tracks t ON t.album_id = al.id
            WHERE lower(al.title) LIKE ?1 OR lower(ar.name) LIKE ?1
            GROUP BY al.id
            ORDER BY lower(al.title)
            "#,
        )?;
        let mut albums_rows = album_stmt.query([&like])?;
        let mut albums = Vec::new();
        while let Some(row) = albums_rows.next()? {
            albums.push(row_to_album(row)?);
        }

        let mut artist_stmt = self.conn.prepare(
            r#"
            SELECT
                ar.id,
                ar.name,
                ar.bio,
                ar.date_added,
                COUNT(DISTINCT al.id) as album_count,
                COUNT(t.id) as track_count
            FROM artists ar
            LEFT JOIN albums al ON al.artist_id = ar.id
            LEFT JOIN tracks t ON t.artist_id = ar.id
            WHERE lower(ar.name) LIKE ?1
            GROUP BY ar.id
            ORDER BY lower(ar.name)
            "#,
        )?;
        let mut artists_rows = artist_stmt.query([&like])?;
        let mut artists = Vec::new();
        while let Some(row) = artists_rows.next()? {
            artists.push(row_to_artist(row)?);
        }

        Ok((tracks, albums, artists))
    }
}

/// Resolve the default path for the library database.
fn default_database_path() -> Result<PathBuf> {
    if let Some(mut dir) = utils::app_data_dir() {
        std::fs::create_dir_all(&dir)?;
        dir.push(DB_FILE_NAME);
        Ok(dir)
    } else {
        let mut dir = std::env::current_dir()?;
        dir.push(DB_FILE_NAME);
        Ok(dir)
    }
}

/// Ensure the core schema exists for the library database.
fn initialize_schema(conn: &mut Connection) -> Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS artists (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL UNIQUE,
            bio TEXT,
            date_added INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            artist_id TEXT,
            cover_art_path TEXT,
            year INTEGER,
            genre TEXT,
            date_added INTEGER NOT NULL,
            FOREIGN KEY (artist_id) REFERENCES artists(id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_title_artist
            ON albums (title, IFNULL(artist_id, ''));

        CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            artist_id TEXT,
            album_artist_id TEXT,
            album_id TEXT,
            track_number INTEGER,
            disc_number INTEGER,
            duration INTEGER NOT NULL,
            file_path TEXT NOT NULL UNIQUE,
            size INTEGER NOT NULL,
            format TEXT NOT NULL,
            bitrate INTEGER,
            sample_rate INTEGER,
            channels INTEGER,
            year INTEGER,
            genre TEXT,
            play_count INTEGER NOT NULL DEFAULT 0,
            last_played INTEGER,
            date_added INTEGER NOT NULL,
            FOREIGN KEY (artist_id) REFERENCES artists(id),
            FOREIGN KEY (album_artist_id) REFERENCES artists(id),
            FOREIGN KEY (album_id) REFERENCES albums(id)
        );

        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            date_added INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id TEXT NOT NULL,
            track_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, track_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );
        "#,
    )?;
    Ok(())
}

/// Persist a track inside the given transaction, returning true if a new row was created.
fn persist_track(tx: &Transaction<'_>, raw: ExtractedTrack) -> Result<bool> {
    let artist_id = match raw.artist_name.as_deref() {
        Some(name) if !name.is_empty() => Some(ensure_artist(tx, name)?),
        _ => None,
    };

    let album_artist_id = match raw.album_artist_name.as_deref() {
        Some(name) if !name.is_empty() => Some(ensure_artist(tx, name)?),
        _ => artist_id,
    };

    let album_id = match raw.album_title.as_deref() {
        Some(title) if !title.is_empty() => Some(ensure_album(tx, title, album_artist_id)?),
        _ => None,
    };

    let existing_id = tx
        .query_row(
            "SELECT id FROM tracks WHERE file_path = ?1",
            params![raw.file_path.to_string_lossy()],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    let track_id = existing_id
        .as_deref()
        .map(Uuid::parse_str)
        .transpose()
        .context("Invalid track identifier stored in database")?
        .unwrap_or_else(Uuid::new_v4);

    let now = Utc::now().timestamp();

    if existing_id.is_some() {
        tx.execute(
            r#"
            UPDATE tracks SET
                title = ?2,
                artist_id = ?3,
                album_artist_id = ?4,
                album_id = ?5,
                track_number = ?6,
                disc_number = ?7,
                duration = ?8,
                size = ?9,
                format = ?10,
                bitrate = ?11,
                sample_rate = ?12,
                channels = ?13,
                year = ?14,
                genre = ?15
            WHERE id = ?1
            "#,
            params![
                track_id.to_string(),
                raw.title,
                artist_id.as_ref().map(Uuid::to_string),
                album_artist_id.as_ref().map(Uuid::to_string),
                album_id.as_ref().map(Uuid::to_string),
                raw.track_number.map(|n| n as i64),
                raw.disc_number.map(|n| n as i64),
                raw.duration as i64,
                raw.size as i64,
                raw.format,
                raw.bitrate as i64,
                raw.sample_rate as i64,
                raw.channels as i64,
                raw.year,
                raw.genre,
            ],
        )?;
        Ok(false)
    } else {
        tx.execute(
            r#"
            INSERT INTO tracks (
                id, title, artist_id, album_artist_id, album_id, track_number, disc_number,
                duration, file_path, size, format, bitrate, sample_rate, channels,
                year, genre, play_count, last_played, date_added
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                ?15, ?16, 0, NULL, ?17
            )
            "#,
            params![
                track_id.to_string(),
                raw.title,
                artist_id.as_ref().map(Uuid::to_string),
                album_artist_id.as_ref().map(Uuid::to_string),
                album_id.as_ref().map(Uuid::to_string),
                raw.track_number.map(|n| n as i64),
                raw.disc_number.map(|n| n as i64),
                raw.duration as i64,
                raw.file_path.to_string_lossy(),
                raw.size as i64,
                raw.format,
                raw.bitrate as i64,
                raw.sample_rate as i64,
                raw.channels as i64,
                raw.year,
                raw.genre,
                now,
            ],
        )?;
        Ok(true)
    }
}

/// Check if an audio extension is supported by the pure-Rust pipeline.
fn is_supported_extension(ext: &str) -> bool {
    const SUPPORTED: &[&str] = &[
        "aac", "aiff", "aif", "aifc", "alac", "flac", "m4a", "m4b", "m4p", "m4r", "m4v", "mp3",
        "ogg", "oga", "opus", "wav",
    ];
    SUPPORTED.contains(&ext.to_ascii_lowercase().as_str())
}

/// Extract metadata from an audio file using Lofty + Symphonia-friendly information.
fn extract_metadata(path: &Path) -> Result<ExtractedTrack> {
    let tagged_file = read_from_path(path)?;
    let properties = tagged_file.properties();
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
        .ok_or_else(|| anyhow!("No metadata tag found for {}", path.display()))?;

    let title = tag
        .title()
        .map(|s| s.to_string())
        .or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "Unknown Track".to_string());

    let duration = properties.duration().as_secs() as u32;
    let track_number = tag.track();
    let disc_number = tag.disk();
    let artist_name = tag.artist().map(|s| s.to_string());
    let album_artist_name = tag.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string());
    let album_title = tag.album().map(|s| s.to_string());
    let year = tag.year().map(|year| year as i32);
    let genre = tag.genre().map(|s| s.to_string());
    let size = std::fs::metadata(path)?.len();
    let format = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());
    let bitrate = properties.audio_bitrate().unwrap_or(0) as u32;
    let sample_rate = properties.sample_rate().unwrap_or(44_100) as u32;
    let channels = properties.channels().unwrap_or(2) as u16;

    Ok(ExtractedTrack {
        title,
        duration,
        track_number,
        disc_number,
        file_path: path.to_path_buf(),
        size,
        format,
        bitrate,
        sample_rate,
        channels,
        artist_name,
        album_artist_name,
        album_title,
        year,
        genre,
    })
}

/// Map a database row to a Track domain model.
fn row_to_track(row: &Row<'_>) -> Result<Track> {
    Ok(Track {
        id: parse_uuid(row.get::<_, String>("id")?)?,
        title: row.get("title")?,
        duration: row.get::<_, i64>("duration")? as u32,
        track_number: row.get::<_, Option<i64>>("track_number")?.map(|n| n as u32),
        disc_number: row.get::<_, Option<i64>>("disc_number")?.map(|n| n as u32),
        path: PathBuf::from(row.get::<_, String>("file_path")?),
        size: row.get::<_, i64>("size")? as u64,
        format: row.get("format")?,
        bitrate: row.get::<_, Option<i64>>("bitrate")?.unwrap_or(0) as u32,
        sample_rate: row.get::<_, Option<i64>>("sample_rate")?.unwrap_or(44_100) as u32,
        channels: row.get::<_, Option<i64>>("channels")?.unwrap_or(2) as u16,
        artist_id: row
            .get::<_, Option<String>>("artist_id")?
            .map(parse_uuid)
            .transpose()?,
        artist_name: row.get("artist_name")?,
        album_artist_id: row
            .get::<_, Option<String>>("album_artist_id")?
            .map(parse_uuid)
            .transpose()?,
        album_artist_name: row.get("album_artist_name")?,
        album_id: row
            .get::<_, Option<String>>("album_id")?
            .map(parse_uuid)
            .transpose()?,
        album_title: row.get("album_title")?,
        year: row.get("year")?,
        genre: row.get("genre")?,
        artwork: None,
        lyrics: None,
        play_count: row.get::<_, i64>("play_count")? as u32,
        last_played: row
            .get::<_, Option<i64>>("last_played")?
            .and_then(|ts| Utc.timestamp_opt(ts, 0).single()),
        date_added: Utc
            .timestamp_opt(row.get::<_, i64>("date_added")?, 0)
            .single()
            .unwrap_or_else(Utc::now),
    })
}

/// Map a database row to an Album domain model.
fn row_to_album(row: &Row<'_>) -> Result<Album> {
    Ok(Album {
        id: parse_uuid(row.get::<_, String>("id")?)?,
        title: row.get("title")?,
        artist_id: row
            .get::<_, Option<String>>("artist_id")?
            .map(parse_uuid)
            .transpose()?,
        artist_name: row.get("artist_name")?,
        year: row.get("year")?,
        genre: row.get("genre")?,
        artwork: None,
        track_count: row.get::<_, i64>("track_count")? as u32,
        duration: row.get::<_, i64>("duration")? as u32,
        date_added: Utc
            .timestamp_opt(row.get::<_, i64>("date_added")?, 0)
            .single()
            .unwrap_or_else(Utc::now),
    })
}

/// Map a database row to an Artist domain model.
fn row_to_artist(row: &Row<'_>) -> Result<Artist> {
    Ok(Artist {
        id: parse_uuid(row.get::<_, String>("id")?)?,
        name: row.get("name")?,
        bio: row.get("bio")?,
        artwork: None,
        album_count: row.get::<_, i64>("album_count")? as u32,
        track_count: row.get::<_, i64>("track_count")? as u32,
        date_added: Utc
            .timestamp_opt(row.get::<_, i64>("date_added")?, 0)
            .single()
            .unwrap_or_else(Utc::now),
    })
}

/// Create or fetch an artist identifier by name.
fn ensure_artist(tx: &Transaction<'_>, name: &str) -> Result<Uuid> {
    if let Some(existing) = tx
        .query_row(
            "SELECT id FROM artists WHERE lower(name) = lower(?1)",
            params![name],
            |row| row.get(0),
        )
        .optional()?
    {
        return parse_uuid(existing);
    }

    let id = Uuid::new_v4();
    tx.execute(
        "INSERT INTO artists (id, name, bio, date_added) VALUES (?1, ?2, NULL, ?3)",
        params![id.to_string(), name, Utc::now().timestamp()],
    )?;
    Ok(id)
}

/// Create or fetch an album identifier by title + artist.
fn ensure_album(tx: &Transaction<'_>, title: &str, artist_id: Option<Uuid>) -> Result<Uuid> {
    let existing = tx
        .query_row(
            "SELECT id FROM albums WHERE lower(title) = lower(?1) AND IFNULL(artist_id, '') = IFNULL(?2, '')",
            params![title, artist_id.as_ref().map(Uuid::to_string)],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(id) = existing {
        return parse_uuid(id);
    }

    let id = Uuid::new_v4();
    tx.execute(
        "INSERT INTO albums (id, title, artist_id, cover_art_path, year, genre, date_added) VALUES (?1, ?2, ?3, NULL, NULL, NULL, ?4)",
        params![id.to_string(), title, artist_id.as_ref().map(Uuid::to_string), Utc::now().timestamp()],
    )?;
    Ok(id)
}

/// Utility to parse UUIDs stored as strings.
fn parse_uuid(value: String) -> Result<Uuid> {
    Uuid::parse_str(&value).context("Invalid UUID stored in database")
}

/// Helper to run a track query with a WHERE clause.
fn query_tracks_with_condition(
    conn: &Connection,
    condition: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<Track>> {
    let sql = format!(
        r#"
        SELECT
            t.id,
            t.title,
            t.duration,
            t.track_number,
            t.disc_number,
            t.file_path,
            t.size,
            t.format,
            t.bitrate,
            t.sample_rate,
            t.channels,
            t.artist_id,
            ar.name as artist_name,
            t.album_artist_id,
            aar.name as album_artist_name,
            t.album_id,
            al.title as album_title,
            t.year,
            t.genre,
            t.play_count,
            t.last_played,
            t.date_added
        FROM tracks t
        LEFT JOIN artists ar ON ar.id = t.artist_id
        LEFT JOIN artists aar ON aar.id = t.album_artist_id
        LEFT JOIN albums al ON al.id = t.album_id
        WHERE {condition}
        ORDER BY lower(t.title)
        "#
    );

    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params)?;
    let mut tracks = Vec::new();
    while let Some(row) = rows.next()? {
        tracks.push(row_to_track(row)?);
    }
    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn schema_initializes_successfully() {
        let temp = NamedTempFile::new().unwrap();
        let mut conn = Connection::open(temp.path()).unwrap();
        initialize_schema(&mut conn).unwrap();
    }
}
