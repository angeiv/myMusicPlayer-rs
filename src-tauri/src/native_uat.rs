use anyhow::{Context, Result};
use chrono::Utc;
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
use lofty::{
    config::WriteOptions,
    picture::{MimeType, Picture, PictureType},
    tag::{Accessor, Tag, TagExt, TagType},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use crate::{Config, utils};

const RUNTIME_ROOT_RELATIVE: &str = ".gsd/runtime/native-uat/current";
const HOST_SNAPSHOT_DIR_NAME: &str = "host-snapshot";
const MANIFEST_FILE_NAME: &str = "manifest.json";
const README_FILE_NAME: &str = "README.md";
const CONFIG_FILE_NAME: &str = "config.json";
const ENV_FILE_NAME: &str = "env.sh";
const POWERSHELL_ENV_FILE_NAME: &str = "env.ps1";
const DB_FILE_NAME: &str = "library.sqlite";

pub const NATIVE_UAT_PROOF_BOUNDARY: &str = "S05 acceptance evidence must come from the native Tauri runtime backed by an isolated fixture library. The browser/Vite shell remains mock regression coverage only and is not valid slice acceptance proof.";
pub const PLAYBACK_GUARDRAIL_CONTEXT: &str = ".gsd/milestones/M001/slices/S04/tasks/T02-CONTEXT.md";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NativeUatSetupResult {
    pub runtime_root: PathBuf,
    pub manifest_path: PathBuf,
    pub env_path: PathBuf,
    pub powershell_env_path: PathBuf,
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub library_root: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct NativeUatManifest {
    created_at: String,
    proof_boundary: String,
    playback_guardrail_context: String,
    host_snapshot: HostSnapshot,
    runtime: RuntimePaths,
    fixture: FixtureLibraryManifest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct HostSnapshot {
    config_path: Option<PathBuf>,
    config_exists: bool,
    config_backup_path: Option<PathBuf>,
    data_dir: Option<PathBuf>,
    database_path: Option<PathBuf>,
    library_paths: Vec<PathBuf>,
    auto_scan: bool,
    last_track_id: Option<String>,
    last_position_seconds: u64,
    parse_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct RuntimePaths {
    runtime_root: PathBuf,
    config_dir: PathBuf,
    data_dir: PathBuf,
    library_root: PathBuf,
    manifest_path: PathBuf,
    env_path: PathBuf,
    powershell_env_path: PathBuf,
    readme_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct FixtureLibraryManifest {
    library_root: PathBuf,
    track_count: usize,
    tracks: Vec<FixtureTrackManifest>,
    scenario_paths: FixtureScenarioPaths,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct FixtureTrackManifest {
    path: PathBuf,
    title: String,
    album_title: String,
    artist_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct FixtureScenarioPaths {
    add_directory: PathBuf,
    modify_track: PathBuf,
    remove_restore_track: PathBuf,
    unavailable_root: PathBuf,
}

#[derive(Debug, Clone)]
struct HostPaths {
    config_dir: Option<PathBuf>,
    data_dir: Option<PathBuf>,
}

pub fn setup_native_uat_fixture(project_root: &Path) -> Result<NativeUatSetupResult> {
    setup_native_uat_fixture_with_host_paths(project_root, &default_host_paths())
}

pub fn teardown_native_uat_fixture(project_root: &Path) -> Result<bool> {
    let runtime_root = runtime_root(project_root);
    if !runtime_root.exists() {
        return Ok(false);
    }

    fs::remove_dir_all(&runtime_root)
        .with_context(|| format!("Failed to remove native UAT runtime root {}", runtime_root.display()))?;
    Ok(true)
}

fn setup_native_uat_fixture_with_host_paths(
    project_root: &Path,
    host_paths: &HostPaths,
) -> Result<NativeUatSetupResult> {
    let runtime_root = runtime_root(project_root);
    if runtime_root.exists() {
        fs::remove_dir_all(&runtime_root).with_context(|| {
            format!(
                "Failed to remove existing native UAT runtime root {}",
                runtime_root.display()
            )
        })?;
    }

    let config_dir = runtime_root.join("config");
    let data_dir = runtime_root.join("data");
    let library_root = runtime_root.join("library");
    let manifest_path = runtime_root.join(MANIFEST_FILE_NAME);
    let env_path = runtime_root.join(ENV_FILE_NAME);
    let powershell_env_path = runtime_root.join(POWERSHELL_ENV_FILE_NAME);
    let readme_path = runtime_root.join(README_FILE_NAME);

    utils::ensure_dir_exists(&config_dir).with_context(|| {
        format!("Failed to create native UAT config dir {}", config_dir.display())
    })?;
    utils::ensure_dir_exists(&data_dir)
        .with_context(|| format!("Failed to create native UAT data dir {}", data_dir.display()))?;

    let host_snapshot = capture_host_snapshot(&runtime_root, host_paths)?;
    let fixture = create_fixture_library(&library_root)?;

    let config = Config {
        library_paths: vec![fixture.library_root.clone()],
        default_volume: 0.7,
        auto_scan: true,
        theme: "system".to_string(),
        play_mode: "sequential".to_string(),
        output_device_id: None,
        last_track_id: None,
        last_position_seconds: 0,
    };
    write_json_file(&config_dir.join(CONFIG_FILE_NAME), &config)?;

    fs::write(
        &env_path,
        render_env_sh(&config_dir, &data_dir),
    )
    .with_context(|| format!("Failed to write {}", env_path.display()))?;
    fs::write(
        &powershell_env_path,
        render_env_ps1(&config_dir, &data_dir),
    )
    .with_context(|| format!("Failed to write {}", powershell_env_path.display()))?;

    let runtime = RuntimePaths {
        runtime_root: runtime_root.clone(),
        config_dir: config_dir.clone(),
        data_dir: data_dir.clone(),
        library_root: fixture.library_root.clone(),
        manifest_path: manifest_path.clone(),
        env_path: env_path.clone(),
        powershell_env_path: powershell_env_path.clone(),
        readme_path: readme_path.clone(),
    };

    let manifest = NativeUatManifest {
        created_at: Utc::now().to_rfc3339(),
        proof_boundary: NATIVE_UAT_PROOF_BOUNDARY.to_string(),
        playback_guardrail_context: PLAYBACK_GUARDRAIL_CONTEXT.to_string(),
        host_snapshot,
        runtime,
        fixture,
    };

    write_json_file(&manifest_path, &manifest)?;
    fs::write(&readme_path, render_readme(&manifest))
        .with_context(|| format!("Failed to write {}", readme_path.display()))?;

    Ok(NativeUatSetupResult {
        runtime_root,
        manifest_path,
        env_path,
        powershell_env_path,
        config_dir,
        data_dir,
        library_root: manifest.fixture.library_root.clone(),
    })
}

fn default_host_paths() -> HostPaths {
    HostPaths {
        config_dir: utils::default_app_config_dir(),
        data_dir: utils::default_app_data_dir(),
    }
}

fn capture_host_snapshot(runtime_root: &Path, host_paths: &HostPaths) -> Result<HostSnapshot> {
    let snapshot_dir = runtime_root.join(HOST_SNAPSHOT_DIR_NAME);
    utils::ensure_dir_exists(&snapshot_dir).with_context(|| {
        format!(
            "Failed to create native UAT host snapshot dir {}",
            snapshot_dir.display()
        )
    })?;

    let config_path = host_paths
        .config_dir
        .as_ref()
        .map(|dir| dir.join(CONFIG_FILE_NAME));
    let data_dir = host_paths.data_dir.clone();
    let database_path = data_dir.as_ref().map(|dir| dir.join(DB_FILE_NAME));

    let mut snapshot = HostSnapshot {
        config_path: config_path.clone(),
        config_exists: false,
        config_backup_path: None,
        data_dir,
        database_path,
        library_paths: Vec::new(),
        auto_scan: Config::default().auto_scan,
        last_track_id: None,
        last_position_seconds: 0,
        parse_error: None,
    };

    let Some(config_path) = config_path else {
        return Ok(snapshot);
    };

    let bytes = match fs::read(&config_path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(snapshot),
        Err(err) => {
            snapshot.parse_error = Some(format!(
                "Failed to read host config {}: {err}",
                config_path.display()
            ));
            return Ok(snapshot);
        }
    };

    snapshot.config_exists = true;
    let backup_path = snapshot_dir.join(CONFIG_FILE_NAME);
    fs::write(&backup_path, &bytes)
        .with_context(|| format!("Failed to write host config snapshot {}", backup_path.display()))?;
    snapshot.config_backup_path = Some(backup_path);

    match serde_json::from_slice::<Config>(&bytes) {
        Ok(config) => {
            snapshot.library_paths = config.library_paths;
            snapshot.auto_scan = config.auto_scan;
            snapshot.last_track_id = config.last_track_id;
            snapshot.last_position_seconds = config.last_position_seconds;
        }
        Err(err) => {
            snapshot.parse_error = Some(format!(
                "Failed to parse host config {}: {err}",
                config_path.display()
            ));
        }
    }

    Ok(snapshot)
}

fn create_fixture_library(library_root: &Path) -> Result<FixtureLibraryManifest> {
    utils::ensure_dir_exists(library_root)
        .with_context(|| format!("Failed to create fixture library root {}", library_root.display()))?;

    let album_one = library_root.join("Fixture Album A");
    let album_two = library_root.join("Fixture Album B");
    let add_directory = library_root.join("incoming");
    utils::ensure_dir_exists(&album_one)?;
    utils::ensure_dir_exists(&album_two)?;
    utils::ensure_dir_exists(&add_directory)?;

    let signal_bloom = create_tagged_track(
        &album_one,
        "01-signal-bloom.wav",
        "Signal Bloom",
        "Fixture Album A",
        "Fixture Artist",
        Some([12, 34, 56]),
    )?;
    let night_drive = create_tagged_track(
        &album_one,
        "02-night-drive.wav",
        "Night Drive",
        "Fixture Album A",
        "Fixture Artist",
        Some([12, 34, 56]),
    )?;
    let offline_echo = create_tagged_track(
        &album_two,
        "01-offline-echo.wav",
        "Offline Echo",
        "Fixture Album B",
        "Fixture Artist",
        Some([98, 45, 12]),
    )?;

    fs::write(album_one.join("cover.png"), png_bytes([12, 34, 56]))?;
    fs::write(album_two.join("cover.png"), png_bytes([98, 45, 12]))?;

    let tracks = vec![
        FixtureTrackManifest {
            path: signal_bloom.clone(),
            title: "Signal Bloom".to_string(),
            album_title: "Fixture Album A".to_string(),
            artist_name: "Fixture Artist".to_string(),
        },
        FixtureTrackManifest {
            path: night_drive.clone(),
            title: "Night Drive".to_string(),
            album_title: "Fixture Album A".to_string(),
            artist_name: "Fixture Artist".to_string(),
        },
        FixtureTrackManifest {
            path: offline_echo,
            title: "Offline Echo".to_string(),
            album_title: "Fixture Album B".to_string(),
            artist_name: "Fixture Artist".to_string(),
        },
    ];

    Ok(FixtureLibraryManifest {
        library_root: library_root.to_path_buf(),
        track_count: tracks.len(),
        scenario_paths: FixtureScenarioPaths {
            add_directory,
            modify_track: signal_bloom,
            remove_restore_track: night_drive,
            unavailable_root: library_root.join("offline-root-mount"),
        },
        tracks,
    })
}

fn create_tagged_track(
    dir: &Path,
    file_name: &str,
    title: &str,
    album_title: &str,
    artist_name: &str,
    artwork_rgb: Option<[u8; 3]>,
) -> Result<PathBuf> {
    let track_path = dir.join(file_name);
    write_silent_wav(&track_path);

    let mut tag = Tag::new(TagType::Id3v2);
    tag.set_title(title.to_string());
    tag.set_artist(artist_name.to_string());
    tag.set_album(album_title.to_string());

    if let Some(rgb) = artwork_rgb {
        tag.push_picture(
            Picture::unchecked(png_bytes(rgb))
                .pic_type(PictureType::CoverFront)
                .mime_type(MimeType::Png)
                .description("Front Cover")
                .build(),
        );
    }

    tag.save_to_path(&track_path, WriteOptions::default())
        .with_context(|| format!("Failed to write fixture tag to {}", track_path.display()))?;

    Ok(track_path)
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

fn render_env_sh(config_dir: &Path, data_dir: &Path) -> String {
    format!(
        "export {}={}\nexport {}={}\n",
        utils::APP_CONFIG_DIR_ENV,
        shell_quote(&config_dir.display().to_string()),
        utils::APP_DATA_DIR_ENV,
        shell_quote(&data_dir.display().to_string()),
    )
}

fn render_env_ps1(config_dir: &Path, data_dir: &Path) -> String {
    format!(
        "$env:{} = '{}'\n$env:{} = '{}'\n",
        utils::APP_CONFIG_DIR_ENV,
        powershell_quote(&config_dir.display().to_string()),
        utils::APP_DATA_DIR_ENV,
        powershell_quote(&data_dir.display().to_string()),
    )
}

fn render_readme(manifest: &NativeUatManifest) -> String {
    format!(
        "# Native UAT fixture runtime\n\n- Proof boundary: {}\n- Playback guardrail: {}\n- Manifest: {}\n- Shell env: {}\n- PowerShell env: {}\n\n## Fixture library\n\n- Root: {}\n- Tracks: {}\n- Add directory: {}\n- Modify target: {}\n- Remove/restore target: {}\n- Unavailable-root path: {}\n",
        manifest.proof_boundary,
        manifest.playback_guardrail_context,
        manifest.runtime.manifest_path.display(),
        manifest.runtime.env_path.display(),
        manifest.runtime.powershell_env_path.display(),
        manifest.fixture.library_root.display(),
        manifest.fixture.track_count,
        manifest.fixture.scenario_paths.add_directory.display(),
        manifest.fixture.scenario_paths.modify_track.display(),
        manifest.fixture.scenario_paths.remove_restore_track.display(),
        manifest.fixture.scenario_paths.unavailable_root.display(),
    )
}

fn runtime_root(project_root: &Path) -> PathBuf {
    project_root.join(RUNTIME_ROOT_RELATIVE)
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(value)
        .with_context(|| format!("Failed to serialize JSON for {}", path.display()))?;
    fs::write(path, bytes).with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn powershell_quote(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn host_paths(project_root: &Path) -> HostPaths {
        HostPaths {
            config_dir: Some(project_root.join("host-config")),
            data_dir: Some(project_root.join("host-data")),
        }
    }

    #[test]
    fn scan_native_uat_setup_creates_isolated_fixture_state() {
        let project_root = TempDir::new().unwrap();
        let host_paths = host_paths(project_root.path());
        let host_config_dir = host_paths.config_dir.as_ref().unwrap();
        utils::ensure_dir_exists(host_config_dir).unwrap();
        fs::write(
            host_config_dir.join(CONFIG_FILE_NAME),
            serde_json::to_vec_pretty(&Config {
                library_paths: vec![PathBuf::from("/Users/example/Music")],
                default_volume: 0.5,
                auto_scan: true,
                theme: "dark".to_string(),
                play_mode: "sequential".to_string(),
                output_device_id: None,
                last_track_id: Some("host-track".to_string()),
                last_position_seconds: 17,
            })
            .unwrap(),
        )
        .unwrap();

        let setup = setup_native_uat_fixture_with_host_paths(project_root.path(), &host_paths)
            .expect("setup should succeed");

        assert!(setup.library_root.exists());
        assert!(setup.config_dir.join(CONFIG_FILE_NAME).exists());
        assert!(setup.env_path.exists());
        assert!(setup.powershell_env_path.exists());
        assert!(setup.manifest_path.exists());

        let manifest: NativeUatManifest =
            serde_json::from_slice(&fs::read(&setup.manifest_path).unwrap()).unwrap();
        assert_eq!(manifest.proof_boundary, NATIVE_UAT_PROOF_BOUNDARY);
        assert_eq!(manifest.playback_guardrail_context, PLAYBACK_GUARDRAIL_CONTEXT);
        assert_eq!(manifest.fixture.track_count, 3);
        assert!(manifest.host_snapshot.config_exists);
        assert_eq!(manifest.host_snapshot.library_paths, vec![PathBuf::from("/Users/example/Music")]);
        assert_eq!(manifest.host_snapshot.last_track_id.as_deref(), Some("host-track"));

        let fixture_config: Config = serde_json::from_slice(
            &fs::read(setup.config_dir.join(CONFIG_FILE_NAME)).unwrap(),
        )
        .unwrap();
        assert_eq!(fixture_config.library_paths, vec![setup.library_root.clone()]);
        assert!(fixture_config.auto_scan);

        let env_text = fs::read_to_string(&setup.env_path).unwrap();
        assert!(env_text.contains(utils::APP_CONFIG_DIR_ENV));
        assert!(env_text.contains(utils::APP_DATA_DIR_ENV));

        let readme = fs::read_to_string(setup.runtime_root.join(README_FILE_NAME)).unwrap();
        assert!(readme.contains("mock regression coverage only"));
        assert!(readme.contains(PLAYBACK_GUARDRAIL_CONTEXT));
    }

    #[test]
    fn scan_native_uat_teardown_removes_fixture_state() {
        let project_root = TempDir::new().unwrap();
        let setup = setup_native_uat_fixture_with_host_paths(project_root.path(), &host_paths(project_root.path()))
            .expect("setup should succeed");

        let removed = teardown_native_uat_fixture(project_root.path()).expect("teardown should succeed");

        assert!(removed);
        assert!(!setup.runtime_root.exists());
    }
}
