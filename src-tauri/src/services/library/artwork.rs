#![allow(dead_code)]

//! Helpers for resolving, fingerprinting, and caching album artwork.

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use image::ImageFormat;
use log::warn;
use uuid::Uuid;

use crate::utils;

const ARTWORK_CACHE_DIR_NAME: &str = "artwork";
const EXTERNAL_ARTWORK_STEMS: &[&str] = &["cover", "folder", "front", "album", "artwork"];
const EXTERNAL_ARTWORK_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "bmp", "webp"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtworkSource {
    External { path: PathBuf, fingerprint: String },
    Embedded { data: Vec<u8>, fingerprint: String },
}

impl ArtworkSource {
    pub fn fingerprint(&self) -> &str {
        match self {
            Self::External { fingerprint, .. } | Self::Embedded { fingerprint, .. } => fingerprint,
        }
    }

    fn decode_image(&self) -> Result<image::DynamicImage> {
        match self {
            Self::External { path, .. } => image::open(path)
                .with_context(|| format!("Failed to decode artwork {}", path.display())),
            Self::Embedded { data, .. } => {
                image::load_from_memory(data).context("Failed to decode embedded artwork")
            }
        }
    }
}

pub fn resolve_external_artwork_source(track_path: &Path) -> Result<Option<ArtworkSource>> {
    for path in find_external_artwork_candidates(track_path)? {
        let fingerprint = match fingerprint_file(&path) {
            Ok(fingerprint) => fingerprint,
            Err(error) => {
                warn!(
                    "Failed to fingerprint external artwork for {}: {}",
                    path.display(),
                    error
                );
                continue;
            }
        };

        let source = ArtworkSource::External {
            path: path.clone(),
            fingerprint,
        };
        if let Err(error) = source.decode_image() {
            warn!(
                "Failed to decode candidate external artwork for {}: {}",
                path.display(),
                error
            );
            continue;
        }

        return Ok(Some(source));
    }

    Ok(None)
}

pub fn embedded_artwork_source(data: &[u8]) -> Option<ArtworkSource> {
    let data = (!data.is_empty()).then_some(data)?;

    Some(ArtworkSource::Embedded {
        data: data.to_vec(),
        fingerprint: fingerprint_bytes(data),
    })
}

pub fn resolve_album_artwork_source(
    track_path: &Path,
    embedded_artwork: Option<&[u8]>,
) -> Result<Option<ArtworkSource>> {
    if let Some(source) = resolve_external_artwork_source(track_path)? {
        return Ok(Some(source));
    }

    Ok(embedded_artwork.and_then(embedded_artwork_source))
}

pub fn artwork_cache_filename(album_id: &Uuid, fingerprint: &str) -> String {
    format!("{album_id}-{fingerprint}.jpg")
}

pub fn artwork_cache_path(cache_root: &Path, album_id: &Uuid, fingerprint: &str) -> PathBuf {
    cache_root
        .join(ARTWORK_CACHE_DIR_NAME)
        .join(artwork_cache_filename(album_id, fingerprint))
}

pub fn write_cached_artwork_to_dir(
    cache_root: &Path,
    album_id: &Uuid,
    source: &ArtworkSource,
) -> Result<PathBuf> {
    let artwork_dir = cache_root.join(ARTWORK_CACHE_DIR_NAME);
    utils::ensure_dir_exists(&artwork_dir).with_context(|| {
        format!(
            "Failed to create artwork cache dir {}",
            artwork_dir.display()
        )
    })?;

    let cache_path = artwork_cache_path(cache_root, album_id, source.fingerprint());
    if cache_path.exists() {
        return Ok(cache_path);
    }

    let image = source.decode_image()?;
    image
        .save_with_format(&cache_path, ImageFormat::Jpeg)
        .with_context(|| format!("Failed to write cached artwork {}", cache_path.display()))?;

    Ok(cache_path)
}

pub fn cache_album_artwork_to_dir(
    cache_root: &Path,
    album_id: &Uuid,
    track_path: &Path,
    embedded_artwork: Option<&[u8]>,
) -> Result<Option<PathBuf>> {
    let source = match resolve_album_artwork_source(track_path, embedded_artwork) {
        Ok(source) => source,
        Err(error) => {
            warn!(
                "Failed to resolve album artwork for {}: {}",
                track_path.display(),
                error
            );
            return Ok(None);
        }
    };

    let Some(source) = source else {
        return Ok(None);
    };

    match write_cached_artwork_to_dir(cache_root, album_id, &source) {
        Ok(path) => Ok(Some(path)),
        Err(error) => {
            warn!(
                "Failed to cache album artwork for {}: {}",
                track_path.display(),
                error
            );
            Ok(None)
        }
    }
}

pub fn cache_album_artwork(
    album_id: &Uuid,
    track_path: &Path,
    embedded_artwork: Option<&[u8]>,
) -> Result<Option<PathBuf>> {
    let Some(cache_root) = utils::app_cache_dir() else {
        return Ok(None);
    };

    cache_album_artwork_to_dir(&cache_root, album_id, track_path, embedded_artwork)
}

fn find_external_artwork_candidates(track_path: &Path) -> Result<Vec<PathBuf>> {
    let Some(parent) = track_path.parent() else {
        return Ok(Vec::new());
    };

    let mut candidates = Vec::new();
    for entry in fs::read_dir(parent)
        .with_context(|| format!("Failed to read artwork directory {}", parent.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(priority) = external_artwork_priority(&path) else {
            continue;
        };
        let sort_key = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_ascii_lowercase())
            .unwrap_or_default();
        candidates.push((priority, sort_key, path));
    }

    candidates.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
    Ok(candidates.into_iter().map(|(_, _, path)| path).collect())
}

fn external_artwork_priority(path: &Path) -> Option<usize> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    if !EXTERNAL_ARTWORK_EXTENSIONS.contains(&extension.as_str()) {
        return None;
    }

    let stem = path.file_stem()?.to_str()?.to_ascii_lowercase();
    EXTERNAL_ARTWORK_STEMS
        .iter()
        .position(|candidate| *candidate == stem)
}

fn fingerprint_file(path: &Path) -> Result<String> {
    let bytes =
        fs::read(path).with_context(|| format!("Failed to read artwork {}", path.display()))?;
    Ok(fingerprint_bytes(&bytes))
}

fn fingerprint_bytes(bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
    use std::{fs, io::Cursor, path::Path};
    use tempfile::tempdir;

    fn png_bytes(rgb: [u8; 3]) -> Vec<u8> {
        let image = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(2, 2, Rgb(rgb)));
        let mut bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn write_png(path: &Path, rgb: [u8; 3]) {
        fs::write(path, png_bytes(rgb)).unwrap();
    }

    #[test]
    fn external_cover_is_preferred_over_embedded_artwork() {
        let dir = tempdir().unwrap();
        let track_path = dir.path().join("track.mp3");
        let cover_path = dir.path().join("CoVeR.PnG");
        let embedded = png_bytes([0, 255, 0]);

        fs::write(&track_path, []).unwrap();
        write_png(&cover_path, [255, 0, 0]);

        let source = resolve_album_artwork_source(&track_path, Some(&embedded))
            .unwrap()
            .expect("artwork source should be resolved");

        match source {
            ArtworkSource::External { path, .. } => assert_eq!(path, cover_path),
            ArtworkSource::Embedded { .. } => panic!("expected external artwork source"),
        }
    }

    #[test]
    fn embedded_artwork_is_used_when_no_external_cover_exists() {
        let dir = tempdir().unwrap();
        let track_path = dir.path().join("track.mp3");
        let embedded = png_bytes([0, 0, 255]);

        fs::write(&track_path, []).unwrap();

        let source = resolve_album_artwork_source(&track_path, Some(&embedded))
            .unwrap()
            .expect("artwork source should be resolved");

        match source {
            ArtworkSource::Embedded { data, .. } => assert_eq!(data, embedded),
            ArtworkSource::External { .. } => panic!("expected embedded artwork source"),
        }
    }

    #[test]
    fn cache_filename_changes_when_source_fingerprint_changes() {
        let source_dir = tempdir().unwrap();
        let cache_dir = tempdir().unwrap();
        let track_path = source_dir.path().join("track.mp3");
        let cover_path = source_dir.path().join("cover.png");
        let album_id = Uuid::new_v4();

        fs::write(&track_path, []).unwrap();
        write_png(&cover_path, [10, 20, 30]);

        let source_before = resolve_album_artwork_source(&track_path, None)
            .unwrap()
            .expect("artwork source should be resolved");
        let cached_before =
            write_cached_artwork_to_dir(cache_dir.path(), &album_id, &source_before).unwrap();

        write_png(&cover_path, [30, 20, 10]);

        let source_after = resolve_album_artwork_source(&track_path, None)
            .unwrap()
            .expect("artwork source should be resolved");
        let cached_after =
            write_cached_artwork_to_dir(cache_dir.path(), &album_id, &source_after).unwrap();

        assert_ne!(cached_before.file_name(), cached_after.file_name());
        assert_eq!(
            cached_before.extension().and_then(|ext| ext.to_str()),
            Some("jpg")
        );
        assert_eq!(
            cached_before
                .parent()
                .and_then(|path| path.file_name())
                .and_then(|name| name.to_str()),
            Some("artwork")
        );
        assert!(cached_before.exists());
        assert!(cached_after.exists());
    }

    #[test]
    fn corrupt_preferred_external_falls_back_to_embedded_artwork() {
        let dir = tempdir().unwrap();
        let track_path = dir.path().join("track.mp3");
        let cover_path = dir.path().join("cover.png");
        let embedded = png_bytes([0, 200, 50]);

        fs::write(&track_path, []).unwrap();
        fs::write(&cover_path, b"broken-cover-bytes").unwrap();

        let source = resolve_album_artwork_source(&track_path, Some(&embedded))
            .unwrap()
            .expect("embedded fallback should be resolved");

        match source {
            ArtworkSource::Embedded { data, .. } => assert_eq!(data, embedded),
            ArtworkSource::External { .. } => panic!("expected embedded artwork fallback"),
        }
    }

    #[test]
    fn corrupt_preferred_external_falls_back_to_lower_priority_external_artwork() {
        let dir = tempdir().unwrap();
        let track_path = dir.path().join("track.mp3");
        let cover_path = dir.path().join("cover.png");
        let folder_path = dir.path().join("folder.png");

        fs::write(&track_path, []).unwrap();
        fs::write(&cover_path, b"broken-cover-bytes").unwrap();
        write_png(&folder_path, [50, 120, 220]);

        let source = resolve_album_artwork_source(&track_path, None)
            .unwrap()
            .expect("lower-priority external fallback should be resolved");

        match source {
            ArtworkSource::External { path, .. } => assert_eq!(path, folder_path),
            ArtworkSource::Embedded { .. } => panic!("expected lower-priority external fallback"),
        }
    }

    #[test]
    fn public_cache_helper_returns_ok_none_when_artwork_cannot_be_decoded() {
        let source_dir = tempdir().unwrap();
        let cache_dir = tempdir().unwrap();
        let track_path = source_dir.path().join("track.mp3");
        let album_id = Uuid::new_v4();

        fs::write(&track_path, []).unwrap();

        let result = cache_album_artwork_to_dir(
            cache_dir.path(),
            &album_id,
            &track_path,
            Some(b"not-an-image"),
        )
        .unwrap();

        assert!(result.is_none());
    }
}
