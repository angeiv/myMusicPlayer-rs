use crate::models::Config;

#[tauri::command]
pub async fn get_config() -> Result<Config, String> {
    // TODO: Implement config loading
    Ok(Config::default())
}

#[tauri::command]
pub async fn save_config(_config: Config) -> Result<(), String> {
    // TODO: Implement config saving
    Ok(())
}

#[tauri::command]
pub async fn get_library_paths() -> Result<Vec<String>, String> {
    // TODO: Implement getting library paths
    Ok(Vec::new())
}

#[tauri::command]
pub async fn add_library_path(_path: String) -> Result<(), String> {
    // TODO: Implement adding library path
    Ok(())
}

#[tauri::command]
pub async fn remove_library_path(_path: String) -> Result<(), String> {
    // TODO: Implement removing library path
    Ok(())
}
