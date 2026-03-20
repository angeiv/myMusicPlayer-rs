//! Local lyrics loading helpers for same-name `.lrc` companion files.

use std::fs;
use std::path::{Path, PathBuf};

use encoding_rs::{Encoding, UTF_8};
use log::warn;

fn companion_lyrics_path(audio_path: &Path) -> PathBuf {
    audio_path.with_extension("lrc")
}

fn decode_lrc(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }

    if let Ok(text) = std::str::from_utf8(bytes) {
        let normalized = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
        let trimmed = normalized.trim();
        return (!trimmed.is_empty()).then(|| trimmed.to_string());
    }

    let gb18030 = Encoding::for_label(b"gb18030").unwrap_or(UTF_8);
    let (decoded, _, had_errors) = gb18030.decode(bytes);
    if had_errors {
        return None;
    }

    let normalized = decoded.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let trimmed = normalized.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

pub fn load_local_lyrics(audio_path: &Path) -> Option<String> {
    let lyrics_path = companion_lyrics_path(audio_path);
    if !lyrics_path.is_file() {
        return None;
    }

    let bytes = match fs::read(&lyrics_path) {
        Ok(bytes) => bytes,
        Err(err) => {
            warn!(
                "Failed to read local lyrics file {}: {}",
                lyrics_path.display(),
                err
            );
            return None;
        }
    };

    decode_lrc(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn returns_none_when_companion_lrc_is_missing() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("demo.mp3");
        fs::write(&audio_path, b"audio").unwrap();

        let lyrics = load_local_lyrics(&audio_path);

        assert_eq!(lyrics, None);
    }

    #[test]
    fn decodes_utf8_and_strips_bom() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("demo.flac");
        let lyrics_path = dir.path().join("demo.lrc");
        fs::write(&audio_path, b"audio").unwrap();
        fs::write(
            &lyrics_path,
            b"\xEF\xBB\xBF[00:01.00]\xe4\xbd\xa0\xe5\xa5\xbd\r\n",
        )
        .unwrap();

        let lyrics = load_local_lyrics(&audio_path);

        assert_eq!(lyrics.as_deref(), Some("[00:01.00]你好"));
    }

    #[test]
    fn decodes_gb18030_lyrics() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("demo.wav");
        let lyrics_path = dir.path().join("demo.lrc");
        fs::write(&audio_path, b"audio").unwrap();

        let gb18030 = Encoding::for_label(b"gb18030").unwrap();
        let (encoded, _, had_errors) = gb18030.encode("[00:02.00]你好");
        assert!(!had_errors);
        fs::write(&lyrics_path, encoded.as_ref()).unwrap();

        let lyrics = load_local_lyrics(&audio_path);

        assert_eq!(lyrics.as_deref(), Some("[00:02.00]你好"));
    }

    #[test]
    fn returns_none_for_blank_lrc_content() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("demo.ogg");
        let lyrics_path = dir.path().join("demo.lrc");
        fs::write(&audio_path, b"audio").unwrap();
        fs::write(&lyrics_path, b"\n \r\n\t").unwrap();

        let lyrics = load_local_lyrics(&audio_path);

        assert_eq!(lyrics, None);
    }

    #[test]
    fn returns_none_for_unparsable_lrc_content() {
        let dir = tempdir().unwrap();
        let audio_path = dir.path().join("demo.aac");
        let lyrics_path = dir.path().join("demo.lrc");
        fs::write(&audio_path, b"audio").unwrap();
        fs::write(&lyrics_path, [0x81, 0x30, 0x81]).unwrap();

        let lyrics = load_local_lyrics(&audio_path);

        assert_eq!(lyrics, None);
    }
}
