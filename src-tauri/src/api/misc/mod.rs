use tauri::command;

#[command]
pub async fn greet(name: String) -> Result<String, String> {
    Ok(format!("Hello, {}!", name))
}
