//! Library service backed by SQLite for managing normalized music metadata.

mod artwork;
mod scan;
#[allow(unused_imports)]
pub use scan::*;

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use anyhow::{Context, Result, anyhow};
use chrono::{TimeZone, Utc};
use lofty::{
    file::AudioFile,
    picture::PictureType,
    prelude::{ItemKey, TaggedFileExt},
    read_from_path,
    tag::Accessor,
};
use log::{info, warn};
use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use uuid::Uuid;
use walkdir::{DirEntry, WalkDir};

use crate::models::{Album, Artist, Track, TrackAvailability};
use crate::utils;

const DB_FILE_NAME: &str = "library.sqlite";

#[derive(Debug, Clone)]
pub struct ScanProgress {
    pub current_path: PathBuf,
    pub processed_files: u64,
    pub inserted_tracks: u64,
    pub error_count: u64,
}

#[derive(Debug, Clone)]
pub struct ScanSummary {
    pub processed_files: u64,
    pub inserted_tracks: u64,
    pub error_count: u64,
    pub sample_errors: Vec<ScanErrorSample>,
    pub cancelled: bool,
}

fn scan_entry_is_visible(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return true;
    }

    let Some(name) = entry.file_name().to_str() else {
        return true;
    };

    // Skip hidden files and directories.
    if name.starts_with('.') {
        return false;
    }

    // Skip common noise directories.
    if entry.file_type().is_dir() && matches!(name, "node_modules" | "target") {
        return false;
    }

    true
}

fn push_scan_error(
    error_count: &mut u64,
    sample_errors: &mut Vec<ScanErrorSample>,
    sample_limit: usize,
    kind: ScanErrorKind,
    path: String,
    message: String,
) {
    *error_count += 1;

    if sample_errors.len() < sample_limit {
        sample_errors.push(ScanErrorSample {
            path,
            message,
            kind,
        });
    }
}

/// Raw metadata decoded from an audio file before persistence.
#[derive(Debug)]
struct ExtractedTrack {
    title: String,
    duration: u32,
    track_number: Option<u32>,
    disc_number: Option<u32>,
    file_path: PathBuf,
    library_root: PathBuf,
    size: u64,
    file_mtime_ms: i64,
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

#[derive(Debug)]
struct PersistTrackResult {
    created_new: bool,
    affected_album_ids: Vec<Uuid>,
}

/// Service responsible for scanning the filesystem and persisting music metadata.
pub struct LibraryService {
    conn: Connection,
    artwork_cache_root: Option<PathBuf>,
}

impl LibraryService {
    /// Create a new library service backed by a sqlite database stored under
    /// the application's data directory.
    pub fn new() -> Result<Self> {
        let db_path = default_database_path()?;
        let mut conn = Connection::open(db_path).context("Failed to open library database")?;
        initialize_schema(&mut conn)?;
        Ok(Self {
            conn,
            artwork_cache_root: utils::app_cache_dir(),
        })
    }

    #[cfg(test)]
    pub fn new_with_path_for_tests<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        let mut conn = Connection::open(path).context("Failed to open library database")?;
        initialize_schema(&mut conn)?;
        Ok(Self {
            conn,
            artwork_cache_root: path.parent().map(|parent| parent.join("cache")),
        })
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
        let mut affected_album_ids = HashSet::new();
        let tx = self.conn.transaction()?;

        for file_path in audio_files {
            match extract_metadata(&file_path, path) {
                Ok(raw) => match persist_track(&tx, raw) {
                    Ok(result) => {
                        if result.created_new {
                            inserted += 1;
                        }
                        affected_album_ids.extend(result.affected_album_ids);
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

        refresh_album_artwork_paths(&tx, self.artwork_cache_root.as_deref(), &affected_album_ids)?;
        tx.commit()?;
        Ok(inserted)
    }

    pub fn scan_roots_with_control(
        &mut self,
        roots: &[PathBuf],
        cancel_flag: &Arc<AtomicBool>,
        sample_limit: usize,
        mut on_progress: impl FnMut(&ScanProgress),
    ) -> Result<ScanSummary> {
        let tx = self.conn.transaction()?;
        let mut processed_files = 0u64;
        let mut inserted_tracks = 0u64;
        let mut error_count = 0u64;
        let mut sample_errors: Vec<ScanErrorSample> = Vec::new();
        let mut affected_album_ids = HashSet::new();

        let deduped_roots = dedupe_overlapping_roots(roots);
        let should_dedupe_files = deduped_roots.len() != roots.len();

        let mut scan_roots: Vec<PathBuf> = Vec::new();
        for root in deduped_roots {
            if is_dangerous_root(&root) {
                push_scan_error(
                    &mut error_count,
                    &mut sample_errors,
                    sample_limit,
                    ScanErrorKind::InvalidPath,
                    root.display().to_string(),
                    "Root path is considered dangerous and will not be scanned".to_string(),
                );
                continue;
            }

            scan_roots.push(root);
        }

        let mut seen_files: Option<HashSet<PathBuf>> = if should_dedupe_files {
            Some(HashSet::new())
        } else {
            None
        };
        let mut cancelled = false;

        'scan: for root in &scan_roots {
            if cancel_flag.load(Ordering::SeqCst) {
                cancelled = true;
                break;
            }

            if !root.exists() || !root.is_dir() {
                push_scan_error(
                    &mut error_count,
                    &mut sample_errors,
                    sample_limit,
                    ScanErrorKind::InvalidPath,
                    root.display().to_string(),
                    "Root path does not exist or is not a directory".to_string(),
                );
                continue;
            }

            for entry in WalkDir::new(root)
                .follow_links(false)
                .into_iter()
                .filter_entry(scan_entry_is_visible)
            {
                match entry {
                    Ok(entry) => {
                        if !entry.file_type().is_file() {
                            continue;
                        }

                        let is_audio = entry
                            .path()
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .map(is_supported_extension)
                            .unwrap_or(false);

                        if !is_audio {
                            continue;
                        }

                        // Cancellation is checked right before processing each candidate file so we can
                        // commit partial work.
                        if cancel_flag.load(Ordering::SeqCst) {
                            cancelled = true;
                            break 'scan;
                        }

                        let file_path = entry.path().to_path_buf();
                        if seen_files
                            .as_mut()
                            .is_some_and(|seen| !seen.insert(file_path.clone()))
                        {
                            continue;
                        }

                        processed_files += 1;

                        match extract_metadata(&file_path, root) {
                            Ok(raw) => match persist_track(&tx, raw) {
                                Ok(result) => {
                                    if result.created_new {
                                        inserted_tracks += 1;
                                    }
                                    affected_album_ids.extend(result.affected_album_ids);
                                }
                                Err(err) => {
                                    warn!(
                                        "Failed to persist metadata for {}: {}",
                                        file_path.display(),
                                        err
                                    );
                                    push_scan_error(
                                        &mut error_count,
                                        &mut sample_errors,
                                        sample_limit,
                                        ScanErrorKind::Persist,
                                        file_path.display().to_string(),
                                        err.to_string(),
                                    );
                                }
                            },
                            Err(err) => {
                                warn!(
                                    "Failed to read metadata for {}: {}",
                                    file_path.display(),
                                    err
                                );
                                push_scan_error(
                                    &mut error_count,
                                    &mut sample_errors,
                                    sample_limit,
                                    ScanErrorKind::ReadMetadata,
                                    file_path.display().to_string(),
                                    err.to_string(),
                                );
                            }
                        }

                        let progress = ScanProgress {
                            current_path: file_path,
                            processed_files,
                            inserted_tracks,
                            error_count,
                        };
                        on_progress(&progress);
                    }
                    Err(err) => {
                        let path = err
                            .path()
                            .map(|path| path.display().to_string())
                            .unwrap_or_else(|| "<unknown>".to_string());

                        warn!("WalkDir error for {}: {}", path, err);
                        push_scan_error(
                            &mut error_count,
                            &mut sample_errors,
                            sample_limit,
                            ScanErrorKind::Walk,
                            path,
                            err.to_string(),
                        );
                    }
                }
            }
        }

        refresh_album_artwork_paths(&tx, self.artwork_cache_root.as_deref(), &affected_album_ids)?;
        tx.commit()?;

        Ok(ScanSummary {
            processed_files,
            inserted_tracks,
            error_count,
            sample_errors,
            cancelled,
        })
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
                t.library_root,
                t.size,
                t.file_mtime_ms,
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
                al.cover_art_path as artwork_path,
                t.year,
                t.genre,
                t.availability,
                t.missing_since,
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
                t.library_root,
                t.size,
                t.file_mtime_ms,
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
                al.cover_art_path as artwork_path,
                t.year,
                t.genre,
                t.availability,
                t.missing_since,
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
            library_root TEXT,
            size INTEGER NOT NULL,
            file_mtime_ms INTEGER,
            format TEXT NOT NULL,
            bitrate INTEGER,
            sample_rate INTEGER,
            channels INTEGER,
            year INTEGER,
            genre TEXT,
            availability TEXT NOT NULL DEFAULT 'available',
            missing_since INTEGER,
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
    ensure_track_scan_columns(conn)?;
    Ok(())
}

fn ensure_track_scan_columns(conn: &Connection) -> Result<()> {
    let columns = conn
        .prepare("PRAGMA table_info(tracks)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    if !columns.iter().any(|name| name == "library_root") {
        conn.execute("ALTER TABLE tracks ADD COLUMN library_root TEXT", [])?;
    }

    if !columns.iter().any(|name| name == "file_mtime_ms") {
        conn.execute("ALTER TABLE tracks ADD COLUMN file_mtime_ms INTEGER", [])?;
    }

    if !columns.iter().any(|name| name == "availability") {
        conn.execute(
            "ALTER TABLE tracks ADD COLUMN availability TEXT NOT NULL DEFAULT 'available'",
            [],
        )?;
    }

    if !columns.iter().any(|name| name == "missing_since") {
        conn.execute("ALTER TABLE tracks ADD COLUMN missing_since INTEGER", [])?;
    }

    conn.execute(
        "UPDATE tracks SET availability = 'available' WHERE availability IS NULL OR trim(availability) = ''",
        [],
    )?;
    conn.execute(
        "UPDATE tracks SET missing_since = NULL WHERE availability <> 'missing'",
        [],
    )?;

    Ok(())
}

/// Persist a track inside the given transaction.
fn persist_track(tx: &Transaction<'_>, raw: ExtractedTrack) -> Result<PersistTrackResult> {
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

    let existing_track = tx
        .query_row(
            "SELECT id, album_id FROM tracks WHERE file_path = ?1",
            params![raw.file_path.to_string_lossy()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()?;

    let existing_id = existing_track.as_ref().map(|(id, _)| id.as_str());
    let previous_album_id = existing_track
        .as_ref()
        .and_then(|(_, album_id)| album_id.as_deref())
        .map(|album_id| {
            Uuid::parse_str(album_id).context("Invalid album identifier stored in database")
        })
        .transpose()?;

    let track_id = existing_id
        .map(Uuid::parse_str)
        .transpose()
        .context("Invalid track identifier stored in database")?
        .unwrap_or_else(Uuid::new_v4);

    let now = Utc::now().timestamp();

    let created_new = if existing_id.is_some() {
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
                library_root = ?10,
                file_mtime_ms = ?11,
                format = ?12,
                bitrate = ?13,
                sample_rate = ?14,
                channels = ?15,
                year = ?16,
                genre = ?17,
                availability = ?18,
                missing_since = NULL
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
                raw.library_root.to_string_lossy().into_owned(),
                raw.file_mtime_ms,
                raw.format,
                raw.bitrate as i64,
                raw.sample_rate as i64,
                raw.channels as i64,
                raw.year,
                raw.genre,
                TrackAvailability::Available.as_db_str(),
            ],
        )?;
        false
    } else {
        tx.execute(
            r#"
            INSERT INTO tracks (
                id, title, artist_id, album_artist_id, album_id, track_number, disc_number,
                duration, file_path, library_root, size, file_mtime_ms, format, bitrate,
                sample_rate, channels, year, genre, availability, missing_since,
                play_count, last_played, date_added
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                ?15, ?16, ?17, ?18, ?19, NULL,
                0, NULL, ?20
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
                raw.library_root.to_string_lossy().into_owned(),
                raw.size as i64,
                raw.file_mtime_ms,
                raw.format,
                raw.bitrate as i64,
                raw.sample_rate as i64,
                raw.channels as i64,
                raw.year,
                raw.genre,
                TrackAvailability::Available.as_db_str(),
                now,
            ],
        )?;
        true
    };

    let mut affected_album_ids = Vec::new();
    if let Some(previous_album_id) = previous_album_id {
        affected_album_ids.push(previous_album_id);
    }
    if let Some(album_id) = album_id
        && !affected_album_ids.contains(&album_id)
    {
        affected_album_ids.push(album_id);
    }

    Ok(PersistTrackResult {
        created_new,
        affected_album_ids,
    })
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
fn extract_metadata(path: &Path, library_root: &Path) -> Result<ExtractedTrack> {
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

    let metadata = std::fs::metadata(path)?;
    let duration = properties.duration().as_secs() as u32;
    let track_number = tag.track();
    let disc_number = tag.disk();
    let artist_name = tag.artist().map(|s| s.to_string());
    let album_artist_name = tag.get_string(ItemKey::AlbumArtist).map(|s| s.to_string());
    let album_title = tag.album().map(|s| s.to_string());
    let year = tag.date().map(|ts| i32::from(ts.year));
    let genre = tag.genre().map(|s| s.to_string());
    let size = metadata.len();
    let file_mtime_ms: i64 = metadata
        .modified()?
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .context("File modification time predates the unix epoch")?
        .as_millis()
        .try_into()
        .context("File modification time is too large to persist")?;
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
        library_root: library_root.to_path_buf(),
        size,
        file_mtime_ms,
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

fn refresh_album_artwork_paths(
    tx: &Transaction<'_>,
    cache_root: Option<&Path>,
    album_ids: &HashSet<Uuid>,
) -> Result<()> {
    for album_id in album_ids {
        let cover_art_path = match resolve_album_artwork_for_album(tx, album_id)? {
            Some(source) => match cache_root {
                Some(cache_root) => {
                    match artwork::write_cached_artwork_to_dir(cache_root, album_id, &source) {
                        Ok(path) => Some(path.to_string_lossy().into_owned()),
                        Err(error) => {
                            warn!(
                                "Failed to cache album artwork for album {}: {}",
                                album_id, error
                            );
                            None
                        }
                    }
                }
                None => None,
            },
            None => None,
        };

        tx.execute(
            "UPDATE albums SET cover_art_path = ?2 WHERE id = ?1",
            params![album_id.to_string(), cover_art_path],
        )?;
    }

    Ok(())
}

fn resolve_album_artwork_for_album(
    tx: &Transaction<'_>,
    album_id: &Uuid,
) -> Result<Option<artwork::ArtworkSource>> {
    let mut stmt = tx.prepare(
        r#"
        SELECT file_path
        FROM tracks
        WHERE album_id = ?1
        ORDER BY lower(file_path)
        "#,
    )?;
    let track_paths = stmt
        .query_map(params![album_id.to_string()], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut embedded_fallback = None;
    for track_path in track_paths {
        let track_path = PathBuf::from(track_path);

        match artwork::resolve_external_artwork_source(&track_path) {
            Ok(Some(source)) => return Ok(Some(source)),
            Ok(None) => {}
            Err(error) => {
                warn!(
                    "Failed to resolve external album artwork for {}: {}",
                    track_path.display(),
                    error
                );
            }
        }

        if embedded_fallback.is_none() {
            match read_embedded_artwork(&track_path) {
                Ok(Some(data)) => {
                    embedded_fallback = artwork::embedded_artwork_source(&data);
                }
                Ok(None) => {}
                Err(error) => {
                    warn!(
                        "Failed to read embedded artwork for {}: {}",
                        track_path.display(),
                        error
                    );
                }
            }
        }
    }

    Ok(embedded_fallback)
}

fn read_embedded_artwork(path: &Path) -> Result<Option<Vec<u8>>> {
    let tagged_file = read_from_path(path)?;
    let Some(tag) = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
    else {
        return Ok(None);
    };

    Ok(tag
        .get_picture_type(PictureType::CoverFront)
        .or_else(|| tag.pictures().first())
        .map(|picture| picture.data().to_vec()))
}

/// Map a database row to a Track domain model.
fn row_to_track(row: &Row<'_>) -> Result<Track> {
    let availability = parse_track_availability(row.get::<_, String>("availability")?)?;
    let missing_since = if availability == TrackAvailability::Missing {
        row.get::<_, Option<i64>>("missing_since")?
            .and_then(|ts| Utc.timestamp_opt(ts, 0).single())
    } else {
        None
    };

    Ok(Track {
        id: parse_uuid(row.get::<_, String>("id")?)?,
        title: row.get("title")?,
        duration: row.get::<_, i64>("duration")? as u32,
        track_number: row.get::<_, Option<i64>>("track_number")?.map(|n| n as u32),
        disc_number: row.get::<_, Option<i64>>("disc_number")?.map(|n| n as u32),
        path: PathBuf::from(row.get::<_, String>("file_path")?),
        library_root: row
            .get::<_, Option<String>>("library_root")?
            .map(PathBuf::from),
        size: row.get::<_, i64>("size")? as u64,
        file_mtime_ms: row.get("file_mtime_ms")?,
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
        artwork_path: row.get("artwork_path")?,
        lyrics: None,
        availability,
        missing_since,
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
        artwork_path: row.get("cover_art_path")?,
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

fn parse_track_availability(value: String) -> Result<TrackAvailability> {
    match value.as_str() {
        "available" => Ok(TrackAvailability::Available),
        "missing" => Ok(TrackAvailability::Missing),
        _ => Err(anyhow!("Invalid track availability stored in database: {value}")),
    }
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
            t.library_root,
            t.size,
            t.file_mtime_ms,
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
            al.cover_art_path as artwork_path,
            t.year,
            t.genre,
            t.availability,
            t.missing_since,
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
    use std::{
        fs,
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
    };

    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
    use lofty::{
        config::WriteOptions,
        picture::{MimeType, Picture, PictureType},
        tag::{Tag, TagExt, TagType},
    };
    use serde_json::Value;
    use tempfile::{NamedTempFile, TempDir};

    fn touch_empty_mp3(path: &Path) {
        fs::write(path, []).unwrap();
    }

    fn new_test_service(tmp: &TempDir) -> LibraryService {
        let db_path = tmp.path().join("library.sqlite");
        LibraryService::new_with_path_for_tests(&db_path).unwrap()
    }

    fn write_silent_wav(path: &Path) {
        let sample_rate = 44_100u32;
        let channels = 1u16;
        let bits_per_sample = 16u16;
        let sample_count = sample_rate / 10;
        let block_align = channels * (bits_per_sample / 8);
        let byte_rate = sample_rate * u32::from(block_align);
        let data_size = sample_count * u32::from(block_align);
        let chunk_size = 36 + data_size;

        let mut bytes = Vec::with_capacity(44 + data_size as usize);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&chunk_size.to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&byte_rate.to_le_bytes());
        bytes.extend_from_slice(&block_align.to_le_bytes());
        bytes.extend_from_slice(&bits_per_sample.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        bytes.resize(44 + data_size as usize, 0);

        fs::write(path, bytes).unwrap();
    }

    fn png_bytes(rgb: [u8; 3]) -> Vec<u8> {
        let image = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(2, 2, Rgb(rgb)));
        let mut bytes = Vec::new();
        image
            .write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn create_tagged_track_with_embedded_artwork(
        dir: &Path,
        file_name: &str,
        title: &str,
        album_title: &str,
        embedded_artwork: Option<&[u8]>,
    ) -> PathBuf {
        let track_path = dir.join(file_name);

        write_silent_wav(&track_path);

        let mut tag = Tag::new(TagType::Id3v2);
        tag.set_title(title.to_string());
        tag.set_artist(String::from("Tagged Artist"));
        tag.set_album(album_title.to_string());

        if let Some(artwork_bytes) = embedded_artwork {
            tag.push_picture(
                Picture::unchecked(artwork_bytes.to_vec())
                    .pic_type(PictureType::CoverFront)
                    .mime_type(MimeType::Png)
                    .description("Front Cover")
                    .build(),
            );
        }

        tag.save_to_path(&track_path, WriteOptions::default())
            .unwrap();

        track_path
    }

    fn create_tagged_track(
        dir: &Path,
        file_name: &str,
        title: &str,
        album_title: &str,
        embedded_artwork_rgb: Option<[u8; 3]>,
    ) -> PathBuf {
        let embedded_artwork = embedded_artwork_rgb.map(png_bytes);
        create_tagged_track_with_embedded_artwork(
            dir,
            file_name,
            title,
            album_title,
            embedded_artwork.as_deref(),
        )
    }

    fn create_tagged_track_fixture(dir: &Path) -> PathBuf {
        let track_path = create_tagged_track(
            dir,
            "tagged-track.wav",
            "Tagged Track",
            "Tagged Album",
            Some([12, 34, 56]),
        );
        let cover_path = dir.join("cover.png");
        fs::write(&cover_path, png_bytes([12, 34, 56])).unwrap();
        track_path
    }

    fn album_cover_art_path(service: &LibraryService, album_title: &str) -> Option<String> {
        service
            .conn
            .query_row(
                "SELECT cover_art_path FROM albums WHERE title = ?1",
                [album_title],
                |row| row.get(0),
            )
            .unwrap()
    }

    fn first_album_cover_art_path(service: &LibraryService) -> Option<String> {
        service
            .conn
            .query_row("SELECT cover_art_path FROM albums LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    fn json_artwork_path(value: &Value) -> Option<&str> {
        value.get("artwork_path").and_then(Value::as_str)
    }

    fn set_first_album_cover_art_path(service: &LibraryService, artwork_path: &str) {
        service
            .conn
            .execute("UPDATE albums SET cover_art_path = ?1", [artwork_path])
            .unwrap();
    }

    #[test]
    fn schema_initializes_successfully() {
        let temp = NamedTempFile::new().unwrap();
        let mut conn = Connection::open(temp.path()).unwrap();
        initialize_schema(&mut conn).unwrap();
    }

    #[test]
    fn scan_skips_hidden_entries() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);

        let root = tmp.path().join("root");
        fs::create_dir_all(&root).unwrap();

        let visible_dir = root.join("music");
        fs::create_dir_all(&visible_dir).unwrap();
        touch_empty_mp3(&visible_dir.join("visible.mp3"));

        let hidden_dir = root.join(".hidden");
        fs::create_dir_all(&hidden_dir).unwrap();
        touch_empty_mp3(&hidden_dir.join("hidden.mp3"));

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let roots = vec![root];

        let mut progress_calls = 0u64;
        let summary = service
            .scan_roots_with_control(&roots, &cancel_flag, 10, |_| {
                progress_calls += 1;
            })
            .unwrap();

        assert_eq!(summary.processed_files, 1);
        assert_eq!(summary.error_count, 1);
        assert_eq!(progress_calls, 1);
    }

    #[test]
    fn scan_caps_error_samples() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);

        let root = tmp.path().join("root");
        fs::create_dir_all(&root).unwrap();

        for name in ["a.mp3", "b.mp3", "c.mp3", "d.mp3", "e.mp3"] {
            touch_empty_mp3(&root.join(name));
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let roots = vec![root];

        let summary = service
            .scan_roots_with_control(&roots, &cancel_flag, 2, |_| {})
            .unwrap();

        assert_eq!(summary.processed_files, 5);
        assert_eq!(summary.error_count, 5);
        assert_eq!(summary.sample_errors.len(), 2);
        assert!(
            summary
                .sample_errors
                .iter()
                .all(|sample| sample.kind == ScanErrorKind::ReadMetadata)
        );
    }

    #[test]
    fn scan_dedupes_overlapping_roots() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);

        let root = tmp.path().join("root");
        let sub = root.join("sub");
        fs::create_dir_all(&sub).unwrap();
        touch_empty_mp3(&sub.join("dup.mp3"));

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let roots = vec![root, sub];

        let summary = service
            .scan_roots_with_control(&roots, &cancel_flag, 10, |_| {})
            .unwrap();

        assert_eq!(summary.processed_files, 1);
        assert_eq!(summary.error_count, 1);
    }

    #[test]
    fn scan_filters_dangerous_roots_and_reports_errors() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);

        let root = tmp.path().join("root");
        fs::create_dir_all(&root).unwrap();
        touch_empty_mp3(&root.join("a.mp3"));

        // Include a `..` component to ensure the root is treated as dangerous.
        let dangerous_root = root.join("..").join("root");

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let roots = vec![dangerous_root];

        let summary = service
            .scan_roots_with_control(&roots, &cancel_flag, 10, |_| {})
            .unwrap();

        assert_eq!(summary.processed_files, 0);
        assert_eq!(summary.error_count, 1);
        assert_eq!(summary.sample_errors.len(), 1);
        assert_eq!(summary.sample_errors[0].kind, ScanErrorKind::InvalidPath);
    }

    #[test]
    fn scan_honors_cancel_flag_and_commits_partial_work() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);

        let root = tmp.path().join("root");
        fs::create_dir_all(&root).unwrap();

        for name in ["a.mp3", "b.mp3", "c.mp3"] {
            touch_empty_mp3(&root.join(name));
        }

        let cancel_flag = Arc::new(AtomicBool::new(false));
        let roots = vec![root];

        let mut seen_progress = 0u64;
        let summary = service
            .scan_roots_with_control(&roots, &cancel_flag, 10, |_| {
                seen_progress += 1;
                if seen_progress == 1 {
                    cancel_flag.store(true, Ordering::SeqCst);
                }
            })
            .unwrap();

        assert!(summary.cancelled);
        assert_eq!(summary.processed_files, 1);
        assert_eq!(summary.error_count, 1);

        // Ensure the database remains usable after a cancelled scan.
        let tracks = service.get_tracks().unwrap();
        assert!(tracks.is_empty());
    }

    #[test]
    fn scan_reuses_cached_album_artwork_path_and_regenerates_missing_cache_file() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        fs::create_dir_all(&root).unwrap();
        create_tagged_track_fixture(&root);

        let inserted = service.scan_directory(&root).unwrap();
        assert_eq!(inserted, 1);

        let initial_path =
            first_album_cover_art_path(&service).expect("cover art path should persist");
        assert!(Path::new(&initial_path).exists());

        let rescanned = service.scan_directory(&root).unwrap();
        assert_eq!(rescanned, 0);

        let reused_path =
            first_album_cover_art_path(&service).expect("cover art path should be reused");
        assert_eq!(reused_path, initial_path);

        fs::remove_file(&initial_path).unwrap();
        assert!(!Path::new(&initial_path).exists());

        let rescanned = service.scan_directory(&root).unwrap();
        assert_eq!(rescanned, 0);

        let regenerated_path =
            first_album_cover_art_path(&service).expect("cover art path should regenerate");
        assert_eq!(regenerated_path, initial_path);
        assert!(Path::new(&regenerated_path).exists());
    }

    #[test]
    fn scan_refreshes_album_cover_art_path_when_cover_source_changes() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        fs::create_dir_all(&root).unwrap();
        create_tagged_track(&root, "track.wav", "Tagged Track", "Tagged Album", None);
        let cover_path = root.join("cover.png");
        fs::write(&cover_path, png_bytes([12, 34, 56])).unwrap();

        service.scan_directory(&root).unwrap();
        let initial_path =
            first_album_cover_art_path(&service).expect("cover art path should persist");
        assert!(Path::new(&initial_path).exists());

        fs::write(&cover_path, png_bytes([56, 34, 12])).unwrap();

        let rescanned = service.scan_directory(&root).unwrap();
        assert_eq!(rescanned, 0);

        let refreshed_path =
            first_album_cover_art_path(&service).expect("cover art path should refresh");
        assert_ne!(refreshed_path, initial_path);
        assert!(Path::new(&refreshed_path).exists());
    }

    #[test]
    fn scan_clears_album_cover_art_path_when_cover_source_is_removed() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        fs::create_dir_all(&root).unwrap();
        create_tagged_track(&root, "track.wav", "Tagged Track", "Tagged Album", None);
        let cover_path = root.join("cover.png");
        fs::write(&cover_path, png_bytes([12, 34, 56])).unwrap();

        service.scan_directory(&root).unwrap();
        assert!(first_album_cover_art_path(&service).is_some());

        fs::remove_file(&cover_path).unwrap();

        let rescanned = service.scan_directory(&root).unwrap();
        assert_eq!(rescanned, 0);
        assert_eq!(first_album_cover_art_path(&service), None);
    }

    #[test]
    fn scan_uses_later_valid_embedded_artwork_when_an_earlier_sibling_is_corrupt() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        let album_dir = root.join("mixed-embedded-album");
        fs::create_dir_all(&album_dir).unwrap();

        create_tagged_track_with_embedded_artwork(
            &album_dir,
            "track-01.wav",
            "Track 01",
            "Mixed Embedded Album",
            Some(b"not-an-image"),
        );
        create_tagged_track(
            &album_dir,
            "track-02.wav",
            "Track 02",
            "Mixed Embedded Album",
            Some([12, 34, 56]),
        );

        let inserted = service.scan_directory(&root).unwrap();
        assert_eq!(inserted, 2);

        let persisted_path = album_cover_art_path(&service, "Mixed Embedded Album")
            .expect("cover art path should persist from the later valid embedded image");
        assert!(Path::new(&persisted_path).exists());
    }

    #[test]
    fn scan_does_not_abort_when_album_artwork_is_corrupt() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        let broken_album = root.join("broken-album");
        let healthy_album = root.join("healthy-album");
        fs::create_dir_all(&broken_album).unwrap();
        fs::create_dir_all(&healthy_album).unwrap();

        create_tagged_track(
            &broken_album,
            "broken-track.wav",
            "Broken Track",
            "Broken Album",
            None,
        );
        fs::write(broken_album.join("cover.png"), b"not-an-image").unwrap();
        create_tagged_track(
            &healthy_album,
            "healthy-track.wav",
            "Healthy Track",
            "Healthy Album",
            Some([90, 40, 10]),
        );

        let inserted = service.scan_directory(&root).unwrap();
        assert_eq!(inserted, 2);
        assert_eq!(service.get_tracks().unwrap().len(), 2);

        let broken_album_artwork = album_cover_art_path(&service, "Broken Album");
        assert_eq!(broken_album_artwork, None);

        let healthy_album_artwork = album_cover_art_path(&service, "Healthy Album")
            .expect("healthy album artwork should persist even when another album is corrupt");
        assert!(Path::new(&healthy_album_artwork).exists());
    }

    #[test]
    fn scan_resolves_album_artwork_using_sibling_track_paths() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        let disc_one = root.join("disc-01");
        let disc_two = root.join("disc-02");
        fs::create_dir_all(&disc_one).unwrap();
        fs::create_dir_all(&disc_two).unwrap();

        create_tagged_track(&disc_one, "track-01.wav", "Track 01", "Shared Album", None);
        create_tagged_track(&disc_two, "track-02.wav", "Track 02", "Shared Album", None);
        fs::write(disc_two.join("cover.png"), png_bytes([90, 40, 10])).unwrap();

        let inserted = service.scan_directory(&root).unwrap();
        assert_eq!(inserted, 2);

        let persisted_path =
            first_album_cover_art_path(&service).expect("cover art path should persist");
        assert!(Path::new(&persisted_path).exists());
    }

    #[test]
    fn album_queries_expose_album_artwork_path() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        fs::create_dir_all(&root).unwrap();
        create_tagged_track_fixture(&root);

        service.scan_directory(&root).unwrap();

        let expected_artwork_path = tmp
            .path()
            .join("cache")
            .join("artwork")
            .join("album-cover.png")
            .to_string_lossy()
            .into_owned();
        set_first_album_cover_art_path(&service, &expected_artwork_path);

        let albums = service.get_albums().unwrap();
        assert_eq!(albums.len(), 1);
        assert_eq!(
            albums[0].artwork_path.as_deref(),
            Some(expected_artwork_path.as_str())
        );

        let album_json = serde_json::to_value(&albums[0]).unwrap();
        assert_eq!(
            json_artwork_path(&album_json),
            Some(expected_artwork_path.as_str())
        );
    }

    #[test]
    fn track_queries_expose_album_artwork_path() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        fs::create_dir_all(&root).unwrap();
        create_tagged_track_fixture(&root);

        service.scan_directory(&root).unwrap();

        let expected_artwork_path = tmp
            .path()
            .join("cache")
            .join("artwork")
            .join("album-cover.png")
            .to_string_lossy()
            .into_owned();
        set_first_album_cover_art_path(&service, &expected_artwork_path);

        let tracks = service.get_tracks().unwrap();
        assert_eq!(tracks.len(), 1);
        let track = &tracks[0];
        assert_eq!(
            track.artwork_path.as_deref(),
            Some(expected_artwork_path.as_str())
        );

        let track_json = serde_json::to_value(track).unwrap();
        assert_eq!(
            json_artwork_path(&track_json),
            Some(expected_artwork_path.as_str())
        );

        let fetched = service.get_track(track.id).unwrap().unwrap();
        assert_eq!(
            fetched.artwork_path.as_deref(),
            Some(expected_artwork_path.as_str())
        );
        let fetched_json = serde_json::to_value(&fetched).unwrap();
        assert_eq!(
            json_artwork_path(&fetched_json),
            Some(expected_artwork_path.as_str())
        );

        let album_id = track.album_id.expect("track should belong to an album");
        let by_album = service.get_tracks_by_album(&album_id).unwrap();
        assert_eq!(by_album.len(), 1);
        assert_eq!(
            by_album[0].artwork_path.as_deref(),
            Some(expected_artwork_path.as_str())
        );
        let by_album_json = serde_json::to_value(&by_album[0]).unwrap();
        assert_eq!(
            json_artwork_path(&by_album_json),
            Some(expected_artwork_path.as_str())
        );
    }

    fn create_legacy_tracks_table(path: &Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE tracks (
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
                date_added INTEGER NOT NULL
            );
            "#,
        )
        .unwrap();
    }

    fn track_column_names(conn: &Connection) -> Vec<String> {
        conn.prepare("PRAGMA table_info(tracks)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<std::result::Result<Vec<_>, _>>()
            .unwrap()
    }

    #[test]
    fn schema_migrates_legacy_tracks_columns_with_safe_defaults() {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("legacy-library.sqlite");
        create_legacy_tracks_table(&db_path);

        let track_id = Uuid::new_v4();
        let legacy_path = tmp.path().join("legacy-track.mp3");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            r#"
            INSERT INTO tracks (
                id, title, artist_id, album_artist_id, album_id, track_number, disc_number,
                duration, file_path, size, format, bitrate, sample_rate, channels,
                year, genre, play_count, last_played, date_added
            ) VALUES (
                ?1, ?2, NULL, NULL, NULL, NULL, NULL,
                ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                NULL, NULL, 0, NULL, ?10
            )
            "#,
            params![
                track_id.to_string(),
                "Legacy Track",
                180i64,
                legacy_path.to_string_lossy().into_owned(),
                512i64,
                "mp3",
                320i64,
                44_100i64,
                2i64,
                Utc::now().timestamp(),
            ],
        )
        .unwrap();
        drop(conn);

        let service = LibraryService::new_with_path_for_tests(&db_path).unwrap();
        let columns = track_column_names(&service.conn);
        assert!(columns.iter().any(|name| name == "library_root"));
        assert!(columns.iter().any(|name| name == "file_mtime_ms"));
        assert!(columns.iter().any(|name| name == "availability"));
        assert!(columns.iter().any(|name| name == "missing_since"));

        let migrated = service.get_track(track_id).unwrap().unwrap();
        let migrated_json = serde_json::to_value(&migrated).unwrap();
        assert_eq!(migrated_json.get("library_root"), Some(&Value::Null));
        assert_eq!(migrated_json.get("file_mtime_ms"), Some(&Value::Null));
        assert_eq!(migrated_json.get("availability"), Some(&Value::String("available".into())));
        assert_eq!(migrated_json.get("missing_since"), Some(&Value::Null));
    }

    #[test]
    fn availability_track_round_trip_exposes_scan_baseline_fields() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        fs::create_dir_all(&root).unwrap();
        let track_path = create_tagged_track_fixture(&root);

        let inserted = service.scan_directory(&root).unwrap();
        assert_eq!(inserted, 1);

        let track = service.get_tracks().unwrap().pop().unwrap();
        let track_json = serde_json::to_value(&track).unwrap();
        let expected_mtime_ms = fs::metadata(&track_path)
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        assert_eq!(track_json.get("library_root"), Some(&Value::String(root.display().to_string())));
        assert_eq!(track_json.get("file_mtime_ms"), Some(&Value::Number(expected_mtime_ms.into())));
        assert_eq!(track_json.get("availability"), Some(&Value::String("available".into())));
        assert_eq!(track_json.get("missing_since"), Some(&Value::Null));
    }

    #[test]
    fn availability_missing_tracks_remain_queryable() {
        let tmp = TempDir::new().unwrap();
        let mut service = new_test_service(&tmp);
        let root = tmp.path().join("library");
        fs::create_dir_all(&root).unwrap();
        create_tagged_track_fixture(&root);

        service.scan_directory(&root).unwrap();
        let track_id = service.get_tracks().unwrap()[0].id;
        let missing_since = Utc::now().timestamp();
        service
            .conn
            .execute(
                r#"
                UPDATE tracks
                SET availability = 'missing', missing_since = ?2
                WHERE id = ?1
                "#,
                params![track_id.to_string(), missing_since],
            )
            .unwrap();

        let fetched = service.get_track(track_id).unwrap().unwrap();
        let listed = service.get_tracks().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, track_id);

        let fetched_json = serde_json::to_value(&fetched).unwrap();
        assert_eq!(fetched_json.get("availability"), Some(&Value::String("missing".into())));
        assert_eq!(
            fetched_json.get("missing_since"),
            Some(&Value::String(
                Utc.timestamp_opt(missing_since, 0)
                    .single()
                    .unwrap()
                    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
            ))
        );
    }
}
