use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

pub struct ActiveSession {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct SshPtyManager {
    pub sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputPayload {
    pub tab_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitPayload {
    pub tab_id: String,
    pub reason: String,
}

pub fn is_safe_ssh_hostname(hostname: &str) -> bool {
    let h = hostname.trim();
    !h.is_empty()
        && h.len() <= 253
        && !h.starts_with('-')
        && h.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ':' | '[' | ']'))
}

pub fn is_safe_ssh_username(username: &str) -> bool {
    let u = username.trim();
    !u.is_empty()
        && u.len() <= 128
        && !u.starts_with('-')
        && u.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '@' | '\\' | '+'))
}

pub fn is_safe_alias_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
}

impl SshPtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn spawn_session(
        &self,
        app: AppHandle,
        tab_id: String,
        mode: String, // "local" | "ssh"
        hostname: String,
        port: u16,
        username: String,
        secret_type: String,
        secret_value: String,
        cols: u16,
        rows: u16,
        initial_aliases: Vec<(String, String)>,
    ) -> Result<(), String> {
        let clean_host = hostname.trim().to_string();
        let clean_user = username.trim().to_string();

        let is_local = mode == "local" || clean_host == "localhost" || clean_host == "127.0.0.1";
        if !is_local {
            if !is_safe_ssh_hostname(&clean_host) {
                return Err(format!("Invalid SSH hostname: '{}'", clean_host));
            }
            if !is_safe_ssh_username(&clean_user) {
                return Err(format!("Invalid SSH username: '{}'", clean_user));
            }
            if port == 0 {
                return Err("Invalid SSH port 0".to_string());
            }
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: if rows > 0 { rows } else { 28 },
                cols: if cols > 0 { cols } else { 100 },
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = if is_local {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let mut c = CommandBuilder::new(shell);
            c.env("TERM", "xterm-256color");
            c
        } else {
            let ssh_bin = if std::path::Path::new("/usr/bin/ssh").exists() {
                "/usr/bin/ssh"
            } else {
                "ssh"
            };
            let mut c = CommandBuilder::new(ssh_bin);
            c.arg("-p");
            c.arg(port.to_string());
            c.arg("-l");
            c.arg(&clean_user);
            c.arg("-o");
            c.arg("StrictHostKeyChecking=accept-new");
            c.arg("-o");
            c.arg("ConnectTimeout=15");
            c.arg("-o");
            c.arg("ServerAliveInterval=30");

            // If Vault credential provides an SSH private key, write a 0600 key file and pass -i
            if secret_type == "ssh_key"
                && !secret_value.trim().is_empty()
                && !secret_value.starts_with("<SSH_")
            {
                let key_dir = std::env::temp_dir().join("soliton-term-keys");
                let _ = std::fs::create_dir_all(&key_dir);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&key_dir, std::fs::Permissions::from_mode(0o700));
                }
                let key_file = key_dir.join(format!("key_{}.pem", tab_id));
                let mut formatted_key = secret_value.trim().to_string();
                if !formatted_key.ends_with('\n') {
                    formatted_key.push('\n');
                }
                if std::fs::write(&key_file, formatted_key.as_bytes()).is_ok() {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = std::fs::set_permissions(
                            &key_file,
                            std::fs::Permissions::from_mode(0o600),
                        );
                    }
                    c.arg("-i");
                    c.arg(key_file.to_string_lossy().to_string());
                }
            }

            c.arg("--");
            c.arg(&clean_host);
            c.env("TERM", "xterm-256color");
            c
        };

        if let Ok(home) = std::env::var("HOME") {
            cmd.cwd(home);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn SSH/PTY process: {}", e))?;

        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        let writer_arc = Arc::new(Mutex::new(writer));

        // Build alias injection payload
        let alias_payload = if !initial_aliases.is_empty() {
            let mut parts = Vec::new();
            for (name, target) in initial_aliases {
                if is_safe_alias_name(&name) {
                    let escaped = target.replace('\'', "'\\''");
                    parts.push(format!("alias {}='{}'", name, escaped));
                }
            }
            if !parts.is_empty() {
                Some(format!(
                    " export HISTCONTROL=ignorespace; {}\n",
                    parts.join("; ")
                ))
            } else {
                None
            }
        } else {
            None
        };

        // If local shell, inject aliases immediately
        if is_local {
            if let Some(ref payload) = alias_payload {
                if let Ok(mut w) = writer_arc.lock() {
                    let _ = w.write_all(payload.as_bytes());
                    let _ = w.flush();
                }
            }
        }

        {
            let mut map = self
                .sessions
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            map.insert(
                tab_id.clone(),
                ActiveSession {
                    writer: Arc::clone(&writer_arc),
                    master: pair.master,
                    child,
                },
            );
        }

        let sessions_ref = Arc::clone(&self.sessions);
        let tab_id_clone = tab_id.clone();
        let writer_for_thread = Arc::clone(&writer_arc);

        let auto_password = if !is_local
            && secret_type == "password"
            && !secret_value.is_empty()
            && !secret_value.starts_with("<DEMO_")
        {
            Some(secret_value)
        } else {
            None
        };

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut password_sent = false;
            let mut rolling_window = String::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(
                            "pty-output",
                            PtyOutputPayload {
                                tab_id: tab_id_clone.clone(),
                                data: text.clone(),
                            },
                        );

                        // Auto-supply Vault password on initial SSH password prompt
                        if !password_sent {
                            if let Some(ref pwd) = auto_password {
                                rolling_window.push_str(&text);
                                if rolling_window.len() > 512 {
                                    let drain_len = rolling_window.len() - 512;
                                    rolling_window.drain(..drain_len);
                                }
                                let lower = rolling_window.to_lowercase();
                                if lower.contains("password:") || lower.contains("passphrase") {
                                    password_sent = true;
                                    if let Ok(mut w) = writer_for_thread.lock() {
                                        let _ = w.write_all(format!("{}\n", pwd).as_bytes());
                                        let _ = w.flush();
                                    }
                                }
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            let mut map = sessions_ref
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            map.remove(&tab_id_clone);
            let _ = app.emit(
                "pty-exit",
                PtyExitPayload {
                    tab_id: tab_id_clone,
                    reason: "Process exited".to_string(),
                },
            );
        });

        Ok(())
    }

    pub fn write_to_session(&self, tab_id: &str, data: &str) -> Result<(), String> {
        let map = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(session) = map.get(tab_id) {
            let mut writer = session
                .writer
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            writer
                .write_all(data.as_bytes())
                .map_err(|e| e.to_string())?;
            writer.flush().map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("Session not found in active PTY pool".to_string())
        }
    }

    pub fn resize_session(&self, tab_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let map = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(session) = map.get(tab_id) {
            session
                .master
                .resize(PtySize {
                    rows: if rows > 0 { rows } else { 24 },
                    cols: if cols > 0 { cols } else { 80 },
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn close_session(&self, tab_id: &str) -> Result<(), String> {
        let mut map = self
            .sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(mut session) = map.remove(tab_id) {
            let _ = session.child.kill();
        }
        Ok(())
    }
}
