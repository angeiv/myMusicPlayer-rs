use std::fs;
use std::path::Path;

fn main() {
    ensure_frontend_dist_dir();
    validate_tauri_toml();

    // This enables the `tauri/custom-protocol` feature flag
    tauri_build::build()
}

fn ensure_frontend_dist_dir() {
    let frontend_dist = Path::new("../dist");
    if frontend_dist.exists() {
        return;
    }

    fs::create_dir_all(frontend_dist)
        .unwrap_or_else(|e| panic!("failed to create {}: {e}", frontend_dist.display()));
}

fn validate_tauri_toml() {
    let tauri_toml_path = Path::new("Tauri.toml");
    let contents = fs::read_to_string(tauri_toml_path)
        .unwrap_or_else(|e| panic!("failed to read {}: {e}", tauri_toml_path.display()));

    toml::from_str::<toml::Value>(&contents)
        .unwrap_or_else(|e| panic!("invalid TOML in {}: {e}", tauri_toml_path.display()));
}
