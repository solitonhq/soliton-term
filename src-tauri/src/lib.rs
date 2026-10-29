pub mod db;
pub mod ssh_pty;
pub mod validate;
pub mod vault_key;

use db::{
    AliasItem, CredentialItem, DatabaseManager, HostEntry, HostGroup, SnippetItem, VaultSnapshot,
};
use serde::{Deserialize, Serialize};
use ssh_pty::SshPtyManager;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatus {
    pub app_name: String,
    pub version: String,
    pub vault_encryption: String,
    pub ssh_engine: String,
}

#[tauri::command]
fn get_system_status() -> SystemStatus {
    SystemStatus {
        app_name: "Soliton Term".to_string(),
        version: "0.1.0".to_string(),
        vault_encryption: "AES-256-GCM + SQLite Vault".to_string(),
        ssh_engine: "portable-pty + OpenSSH + xterm.js".to_string(),
    }
}

#[tauri::command]
fn load_vault_snapshot(db: State<'_, DatabaseManager>) -> Result<VaultSnapshot, String> {
    db.load_snapshot().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_vault_snapshot(
    db: State<'_, DatabaseManager>,
    snapshot: VaultSnapshot,
    replace_existing: bool,
) -> Result<VaultSnapshot, String> {
    validate::snapshot(&snapshot)?;
    db.import_snapshot(snapshot, replace_existing)
        .map_err(|e| e.to_string())?;
    db.load_snapshot().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_group(db: State<'_, DatabaseManager>, item: HostGroup) -> Result<(), String> {
    validate::group(&item)?;
    db.upsert_group(item).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_group(db: State<'_, DatabaseManager>, id: String) -> Result<(), String> {
    db.delete_group(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_credential(db: State<'_, DatabaseManager>, item: CredentialItem) -> Result<(), String> {
    validate::credential(&item)?;
    db.upsert_credential(item).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_credential(db: State<'_, DatabaseManager>, id: String) -> Result<(), String> {
    db.delete_credential(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_host(db: State<'_, DatabaseManager>, item: HostEntry) -> Result<(), String> {
    validate::host(&item)?;
    db.upsert_host(item).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_host(db: State<'_, DatabaseManager>, id: String) -> Result<(), String> {
    db.delete_host(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_snippet(db: State<'_, DatabaseManager>, item: SnippetItem) -> Result<(), String> {
    validate::snippet(&item)?;
    db.upsert_snippet(item).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_snippet(db: State<'_, DatabaseManager>, id: String) -> Result<(), String> {
    db.delete_snippet(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_alias(db: State<'_, DatabaseManager>, item: AliasItem) -> Result<(), String> {
    validate::alias(&item)?;
    db.upsert_alias(item).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_alias(db: State<'_, DatabaseManager>, id: String) -> Result<(), String> {
    db.delete_alias(&id).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn start_pty_session(
    app: AppHandle,
    pty_mgr: State<'_, SshPtyManager>,
    tab_id: String,
    mode: String,
    hostname: String,
    port: u16,
    username: String,
    secret_type: String,
    secret_value: String,
    cols: u16,
    rows: u16,
    initial_aliases: Vec<(String, String)>,
) -> Result<(), String> {
    pty_mgr.spawn_session(
        app,
        tab_id,
        mode,
        hostname,
        port,
        username,
        secret_type,
        secret_value,
        cols,
        rows,
        initial_aliases,
    )
}

#[tauri::command]
fn write_pty_input(
    pty_mgr: State<'_, SshPtyManager>,
    tab_id: String,
    data: String,
) -> Result<(), String> {
    pty_mgr.write_to_session(&tab_id, &data)
}

#[tauri::command]
fn resize_pty_session(
    pty_mgr: State<'_, SshPtyManager>,
    tab_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty_mgr.resize_session(&tab_id, cols, rows)
}

#[tauri::command]
fn close_pty_session(pty_mgr: State<'_, SshPtyManager>, tab_id: String) -> Result<(), String> {
    pty_mgr.close_session(&tab_id)
}

#[tauri::command]
fn build_alias_injection_payload(aliases: Vec<(String, String)>) -> String {
    let mut parts = Vec::new();
    for (name, cmd) in aliases {
        if ssh_pty::is_safe_alias_name(&name) {
            let escaped = cmd.replace('\'', "'\\''");
            parts.push(format!("alias {}='{}'", name, escaped));
        }
    }
    if parts.is_empty() {
        return String::new();
    }
    format!(
        " export HISTCONTROL=ignorespace; {}; clear\n",
        parts.join("; ")
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("soliton-term"));
            ssh_pty::purge_stale_key_files();
            let db_manager = DatabaseManager::new(app_dir)?;
            app.manage(db_manager);
            app.manage(SshPtyManager::new());
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            load_vault_snapshot,
            import_vault_snapshot,
            save_group,
            remove_group,
            save_credential,
            remove_credential,
            save_host,
            remove_host,
            save_snippet,
            remove_snippet,
            save_alias,
            remove_alias,
            start_pty_session,
            write_pty_input,
            resize_pty_session,
            close_pty_session,
            build_alias_injection_payload
        ])
        .build(tauri::generate_context!())
        .expect("error while building Soliton Term application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                ssh_pty::purge_stale_key_files();
            }
        });
}
