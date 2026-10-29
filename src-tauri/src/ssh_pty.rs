use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub struct ActiveSession {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn Child + Send + Sync>,
    /// Ephemeral private-key file for this session, deleted when it ends.
    pub key_file: Option<PathBuf>,
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

const KEY_DIR_NAME: &str = "soliton-term-keys";
const PASSWORD_PROMPT_WINDOW: Duration = Duration::from_secs(20);

fn key_dir() -> PathBuf {
    std::env::temp_dir().join(KEY_DIR_NAME)
}

/// Removes any key files left behind by a crash or forced quit.
pub fn purge_stale_key_files() {
    if let Ok(entries) = std::fs::read_dir(key_dir()) {
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn remove_key_file(path: &Option<PathBuf>) {
    if let Some(p) = path {
        let _ = std::fs::remove_file(p);
    }
}

/// Writes the private key to a fresh, randomly named file that is `0600` from
/// the moment it is created (no window where it is world-readable).
fn write_ephemeral_key(private_key: &str) -> Result<PathBuf, String> {
    let dir = key_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create key directory: {e}"))?;
    let mut name = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut name);
    let path = dir.join(format!(
        "k_{}",
        name.iter().map(|b| format!("{b:02x}")).collect::<String>()
    ));

    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        opts.mode(0o600);
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    let mut file = opts
        .open(&path)
        .map_err(|e| format!("Cannot create key file: {e}"))?;
    let mut key = private_key.trim().to_string();
    key.push('\n');
    file.write_all(key.as_bytes())
        .map_err(|e| format!("Cannot write key file: {e}"))?;
    Ok(path)
}

/// Incremental UTF-8 decoder for PTY output. Multi-byte characters that are
/// split across `read()` calls are held back instead of becoming U+FFFD.
#[derive(Default)]
pub struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    pub fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut out = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(s) => {
                    out.push_str(s);
                    self.pending.clear();
                    break;
                }
                Err(e) => {
                    let valid = e.valid_up_to();
                    out.push_str(&String::from_utf8_lossy(&self.pending[..valid]));
                    match e.error_len() {
                        Some(bad) => {
                            out.push('\u{FFFD}');
                            self.pending.drain(..valid + bad);
                        }
                        None => {
                            self.pending.drain(..valid);
                            break;
                        }
                    }
                }
            }
        }
        out
    }
}

/// Detects the *local* OpenSSH password prompt so the vault password can be
/// supplied once. It only fires when the current line ends with `password:`,
/// within a short window after connect — so `sudo`'s `[sudo] password for x:`
/// and banner text are never answered.
pub struct PasswordPrompt {
    line: String,
    started: Instant,
    done: bool,
}

impl Default for PasswordPrompt {
    fn default() -> Self {
        Self::new()
    }
}

impl PasswordPrompt {
    pub fn new() -> Self {
        Self {
            line: String::new(),
            started: Instant::now(),
            done: false,
        }
    }

    pub fn feed(&mut self, text: &str) -> bool {
        if self.done || self.started.elapsed() > PASSWORD_PROMPT_WINDOW {
            return false;
        }
        for c in text.chars() {
            if c == '\n' || c == '\r' {
                self.line.clear();
            } else {
                self.line.push(c);
            }
        }
        // Keep only the tail, on a char boundary.
        let excess = self.line.chars().count().saturating_sub(256);
        if excess > 0 {
            self.line = self.line.chars().skip(excess).collect();
        }
        if self.line.trim_end().to_lowercase().ends_with("password:") {
            self.done = true;
            return true;
        }
        false
    }
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

        let is_local = mode == "local";
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

        let mut key_file: Option<PathBuf> = None;
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

            // If the Vault credential is an SSH private key, hand it to ssh via an
            // ephemeral 0600 file that is removed when the session ends.
            if secret_type == "ssh_key"
                && !secret_value.trim().is_empty()
                && !secret_value.starts_with("<SSH_")
            {
                let path = write_ephemeral_key(&secret_value)?;
                c.arg("-o");
                c.arg("IdentitiesOnly=yes");
                c.arg("-i");
                c.arg(path.to_string_lossy().to_string());
                key_file = Some(path);
            }

            c.arg("--");
            c.arg(&clean_host);
            c.env("TERM", "xterm-256color");
            c
        };

        if let Ok(home) = std::env::var("HOME") {
            cmd.cwd(home);
        }

        let child = match pair.slave.spawn_command(cmd) {
            Ok(child) => child,
            Err(e) => {
                remove_key_file(&key_file);
                return Err(format!("Failed to spawn SSH/PTY process: {}", e));
            }
        };

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
                    key_file: key_file.clone(),
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
            let mut decoder = Utf8Stream::default();
            let mut prompt = PasswordPrompt::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let text = decoder.push(&buf[..n]);
                        if text.is_empty() {
                            continue;
                        }
                        if auto_password.is_some() && prompt.feed(&text) {
                            if let (Some(pwd), Ok(mut w)) =
                                (auto_password.as_ref(), writer_for_thread.lock())
                            {
                                let _ = w.write_all(format!("{}\n", pwd).as_bytes());
                                let _ = w.flush();
                            }
                        }
                        let _ = app.emit(
                            "pty-output",
                            PtyOutputPayload {
                                tab_id: tab_id_clone.clone(),
                                data: text,
                            },
                        );
                    }
                }
            }
            let removed = sessions_ref
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .remove(&tab_id_clone);
            remove_key_file(&removed.and_then(|s| s.key_file));
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
            remove_key_file(&session.key_file);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_stream_reassembles_split_characters() {
        let mut d = Utf8Stream::default();
        let bytes = "çğş→".as_bytes();
        let mut out = String::new();
        for b in bytes {
            out.push_str(&d.push(&[*b]));
        }
        assert_eq!(out, "çğş→");
    }

    #[test]
    fn utf8_stream_replaces_invalid_bytes_without_stalling() {
        let mut d = Utf8Stream::default();
        assert_eq!(d.push(&[b'a', 0xFF, b'b']), "a\u{FFFD}b");
    }

    #[test]
    fn answers_openssh_password_prompt_once() {
        let mut p = PasswordPrompt::new();
        assert!(!p.feed("Welcome\r\nroot@10.0.0.1's pass"));
        assert!(p.feed("word: "));
        assert!(!p.feed("\r\nPassword:"), "must only answer once");
    }

    #[test]
    fn ignores_sudo_prompts_and_banner_text() {
        let mut p = PasswordPrompt::new();
        assert!(!p.feed("Never share your password: it is secret\r\n"));
        assert!(!p.feed("[sudo] password for ops: "));
    }

    #[test]
    fn prompt_tail_trimming_is_char_safe() {
        let mut p = PasswordPrompt::new();
        assert!(!p.feed(&"ş".repeat(1000)));
        assert!(p.feed("Password:"));
    }

    #[test]
    fn hostnames_and_usernames_reject_option_injection() {
        assert!(!is_safe_ssh_hostname("-oProxyCommand=x"));
        assert!(!is_safe_ssh_hostname("a b"));
        assert!(is_safe_ssh_hostname("db-01.internal"));
        assert!(!is_safe_ssh_username("-l"));
        assert!(is_safe_ssh_username("DOMAIN\\user"));
    }

    #[cfg(unix)]
    #[test]
    fn ephemeral_key_is_private_and_randomly_named() {
        use std::os::unix::fs::PermissionsExt;
        let a = write_ephemeral_key("KEY").unwrap();
        let b = write_ephemeral_key("KEY").unwrap();
        assert_ne!(a, b);
        assert_eq!(
            std::fs::metadata(&a).unwrap().permissions().mode() & 0o777,
            0o600
        );
        remove_key_file(&Some(a.clone()));
        remove_key_file(&Some(b));
        assert!(!a.exists());
    }
}
