use crate::vault_key;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostGroup {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialItem {
    pub id: String,
    pub name: String,
    pub username: String,
    pub secret_type: String, // "password" | "ssh_key"
    pub secret_value: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostEntry {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub port: u16,
    pub group_id: String,
    pub credential_id: String,
    pub tags: Vec<String>,
    pub os: Option<String>,
    pub inject_aliases: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetItem {
    pub id: String,
    pub name: String,
    pub command: String,
    pub category: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AliasItem {
    pub id: String,
    pub alias: String,
    pub command: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSnapshot {
    pub groups: Vec<HostGroup>,
    pub credentials: Vec<CredentialItem>,
    pub hosts: Vec<HostEntry>,
    pub snippets: Vec<SnippetItem>,
    pub aliases: Vec<AliasItem>,
}

pub struct DatabaseManager {
    pub conn: Mutex<Connection>,
    cipher: Aes256Gcm,
}

impl DatabaseManager {
    /// Opens the vault in `app_dir`, fetching the master key from the Keychain
    /// (migrating the legacy key file on first run).
    pub fn new(app_dir: PathBuf) -> Result<Self, String> {
        Self::prepare_dir(&app_dir)?;
        let key = vault_key::load_or_create_key(&app_dir, &vault_key::KeychainBackend::default())?;
        Self::open(app_dir, key)
    }

    /// Opens the vault with an explicit key. Used by `new` and by tests.
    pub fn open(app_dir: PathBuf, key_bytes: [u8; 32]) -> Result<Self, String> {
        Self::prepare_dir(&app_dir)?;
        let db_path = app_dir.join("soliton_vault.sqlite3");
        let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open vault: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&db_path, fs::Permissions::from_mode(0o600))
                .map_err(|e| format!("Failed to restrict vault permissions: {e}"))?;
        }

        let manager = Self {
            conn: Mutex::new(conn),
            cipher: Aes256Gcm::new(&key_bytes.into()),
        };
        manager.init_schema().map_err(|e| e.to_string())?;
        manager.seed_starters_once().map_err(|e| e.to_string())?;
        Ok(manager)
    }

    fn prepare_dir(app_dir: &PathBuf) -> Result<(), String> {
        fs::create_dir_all(app_dir).map_err(|e| format!("Failed to create data dir: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(app_dir, fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("Failed to restrict data dir permissions: {e}"))?;
        }
        Ok(())
    }

    pub fn encrypt_secret(&self, plaintext: &str) -> Result<String, String> {
        if plaintext.is_empty() {
            return Ok(String::new());
        }
        let nonce_bytes: [u8; 12] = rand::random();
        let ciphertext = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_bytes())
            .map_err(|_| "Failed to encrypt credential".to_string())?;
        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);
        Ok(BASE64.encode(combined))
    }

    /// Fails loudly instead of handing the ciphertext back as if it were the secret.
    pub fn decrypt_secret(&self, encoded: &str) -> Result<String, String> {
        if encoded.is_empty() {
            return Ok(String::new());
        }
        let combined = BASE64
            .decode(encoded)
            .map_err(|_| "Credential ciphertext is not valid base64".to_string())?;
        if combined.len() <= 12 {
            return Err("Credential ciphertext is truncated".into());
        }
        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let plain = self
            .cipher
            .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
            .map_err(|_| {
                "Credential could not be decrypted (wrong key or corrupted data)".to_string()
            })?;
        String::from_utf8(plain).map_err(|_| "Credential is not valid UTF-8".to_string())
    }

    fn init_schema(&self) -> SqlResult<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_id TEXT,
                icon TEXT
            );
            CREATE TABLE IF NOT EXISTS credentials (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT NOT NULL,
                secret_type TEXT NOT NULL,
                secret_cipher TEXT NOT NULL,
                description TEXT
            );
            CREATE TABLE IF NOT EXISTS hosts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                hostname TEXT NOT NULL,
                port INTEGER NOT NULL,
                group_id TEXT NOT NULL,
                credential_id TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                os TEXT,
                inject_aliases INTEGER NOT NULL DEFAULT 1,
                notes TEXT
            );
            CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS aliases (
                id TEXT PRIMARY KEY,
                alias TEXT NOT NULL,
                command TEXT NOT NULL,
                description TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            );
            ",
        )?;
        Ok(())
    }

    /// First-run content: useful, non-sensitive snippets and aliases. Never
    /// hosts or credentials. A `meta` flag makes this a one-time event, so
    /// deleting every snippet later does not bring them back.
    fn seed_starters_once(&self) -> SqlResult<()> {
        let (seeded, has_content): (bool, bool) = self.with_conn(|c| {
            let seeded = c
                .query_row("SELECT 1 FROM meta WHERE key = 'starters_seeded'", [], |_| Ok(()))
                .is_ok();
            let has_content: i64 = c.query_row(
                "SELECT (SELECT COUNT(*) FROM hosts) + (SELECT COUNT(*) FROM snippets) + (SELECT COUNT(*) FROM aliases)",
                [],
                |r| r.get(0),
            )?;
            Ok((seeded, has_content > 0))
        })?;
        if seeded {
            return Ok(());
        }
        if !has_content {
            let snippet =
                |id: &str, name: &str, command: &str, category: &str, description: &str| {
                    SnippetItem {
                        id: id.into(),
                        name: name.into(),
                        command: command.into(),
                        category: category.into(),
                        description: description.into(),
                    }
                };
            let alias = |id: &str, alias: &str, command: &str, description: &str| AliasItem {
                id: id.into(),
                alias: alias.into(),
                command: command.into(),
                description: description.into(),
                enabled: true,
            };
            for s in [
                snippet(
                    "snip-health",
                    "System Health & Resource Check",
                    "uptime && free -h && df -hT | grep -v tmpfs",
                    "Diagnostics",
                    "CPU load, RAM and disk usage at a glance",
                ),
                snippet(
                    "snip-k8s-logs",
                    "K8s Pod Logs by Namespace",
                    "kubectl logs -n {{namespace}} -l app={{service_name}} --tail={{lines}}",
                    "Kubernetes",
                    "Recent logs for a service, with prompts for each {{variable}}",
                ),
                snippet(
                    "snip-port",
                    "Who Is Listening on a Port",
                    "ss -tulpn | grep :{{port}}",
                    "Network",
                    "Find the process bound to a TCP/UDP port",
                ),
                snippet(
                    "snip-docker-stats",
                    "Docker Container Stats",
                    "docker stats --no-stream",
                    "Containers",
                    "CPU and memory snapshot per container",
                ),
            ] {
                self.upsert_snippet(s)?;
            }
            for a in [
                alias("al-ll", "ll", "ls -lah", "Detailed directory listing"),
                alias("al-k", "k", "kubectl", "Shorthand for kubectl"),
                alias(
                    "al-dcu",
                    "dcu",
                    "docker compose up -d",
                    "Start a compose stack in the background",
                ),
                alias("al-ports", "ports", "ss -tulpn", "Show listening ports"),
            ] {
                self.upsert_alias(a)?;
            }
        }
        self.with_conn(|c| {
            c.execute(
                "INSERT OR IGNORE INTO meta (key, value) VALUES ('starters_seeded', '1')",
                [],
            )
            .map(|_| ())
        })
    }

    pub fn load_snapshot(&self) -> SqlResult<VaultSnapshot> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let mut stmt_g = conn.prepare("SELECT id, name, parent_id, icon FROM groups")?;
        let groups = stmt_g
            .query_map([], |r| {
                Ok(HostGroup {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    parent_id: r.get(2)?,
                    icon: r.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt_c = conn.prepare(
            "SELECT id, name, username, secret_type, secret_cipher, description FROM credentials",
        )?;
        let credentials = stmt_c
            .query_map([], |r| {
                let cipher_str: String = r.get(4)?;
                Ok(CredentialItem {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    username: r.get(2)?,
                    secret_type: r.get(3)?,
                    secret_value: self.decrypt_secret(&cipher_str).unwrap_or_else(|e| {
                        eprintln!("vault: credential left blank: {e}");
                        String::new()
                    }),
                    description: r.get(5)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt_h = conn.prepare(
            "SELECT id, name, hostname, port, group_id, credential_id, tags_json, os, inject_aliases, notes FROM hosts",
        )?;
        let hosts = stmt_h
            .query_map([], |r| {
                let tags_raw: String = r.get(6)?;
                let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
                let inject_int: i64 = r.get(8)?;
                Ok(HostEntry {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    hostname: r.get(2)?,
                    port: r.get::<_, u16>(3)?,
                    group_id: r.get(4)?,
                    credential_id: r.get(5)?,
                    tags,
                    os: r.get(7)?,
                    inject_aliases: inject_int != 0,
                    notes: r.get(9)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt_s =
            conn.prepare("SELECT id, name, command, category, description FROM snippets")?;
        let snippets = stmt_s
            .query_map([], |r| {
                Ok(SnippetItem {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    command: r.get(2)?,
                    category: r.get(3)?,
                    description: r.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt_a =
            conn.prepare("SELECT id, alias, command, description, enabled FROM aliases")?;
        let aliases = stmt_a
            .query_map([], |r| {
                let en: i64 = r.get(4)?;
                Ok(AliasItem {
                    id: r.get(0)?,
                    alias: r.get(1)?,
                    command: r.get(2)?,
                    description: r.get(3)?,
                    enabled: en != 0,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(VaultSnapshot {
            groups,
            credentials,
            hosts,
            snippets,
            aliases,
        })
    }

    pub fn delete_group(&self, id: &str) -> SqlResult<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute(
            "UPDATE groups SET parent_id = NULL WHERE parent_id = ?1",
            params![id],
        )?;
        conn.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_credential(&self, id: &str) -> SqlResult<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute("DELETE FROM credentials WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_host(&self, id: &str) -> SqlResult<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute("DELETE FROM hosts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_snippet(&self, id: &str) -> SqlResult<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_alias(&self, id: &str) -> SqlResult<()> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        conn.execute("DELETE FROM aliases WHERE id = ?1", params![id])?;
        Ok(())
    }

    fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> SqlResult<T>) -> SqlResult<T> {
        let conn = self
            .conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        f(&conn)
    }

    fn encrypt_for_sql(&self, secret: &str) -> SqlResult<String> {
        self.encrypt_secret(secret)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(e.into()))
    }

    pub fn upsert_group(&self, item: HostGroup) -> SqlResult<()> {
        self.with_conn(|c| write_group(c, &item))
    }

    pub fn upsert_credential(&self, item: CredentialItem) -> SqlResult<()> {
        let encrypted = self.encrypt_for_sql(&item.secret_value)?;
        self.with_conn(|c| write_credential(c, &item, &encrypted))
    }

    pub fn upsert_host(&self, item: HostEntry) -> SqlResult<()> {
        self.with_conn(|c| write_host(c, &item))
    }

    pub fn upsert_snippet(&self, item: SnippetItem) -> SqlResult<()> {
        self.with_conn(|c| write_snippet(c, &item))
    }

    pub fn upsert_alias(&self, item: AliasItem) -> SqlResult<()> {
        self.with_conn(|c| write_alias(c, &item))
    }

    /// All-or-nothing: encrypts everything first, then applies the bundle in a
    /// single transaction so a failure can never leave a half-replaced vault.
    pub fn import_snapshot(
        &self,
        snapshot: VaultSnapshot,
        replace_existing: bool,
    ) -> SqlResult<()> {
        let encrypted: Vec<String> = snapshot
            .credentials
            .iter()
            .map(|c| self.encrypt_for_sql(&c.secret_value))
            .collect::<SqlResult<_>>()?;

        self.with_conn(|conn| {
            let tx = conn.unchecked_transaction()?;
            if replace_existing {
                tx.execute_batch(
                    "DELETE FROM groups; DELETE FROM credentials; DELETE FROM hosts; DELETE FROM snippets; DELETE FROM aliases;",
                )?;
            }
            for g in &snapshot.groups {
                write_group(&tx, g)?;
            }
            for (c, enc) in snapshot.credentials.iter().zip(&encrypted) {
                write_credential(&tx, c, enc)?;
            }
            for h in &snapshot.hosts {
                write_host(&tx, h)?;
            }
            for s in &snapshot.snippets {
                write_snippet(&tx, s)?;
            }
            for a in &snapshot.aliases {
                write_alias(&tx, a)?;
            }
            tx.commit()
        })
    }
}

fn write_group(conn: &Connection, item: &HostGroup) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO groups (id, name, parent_id, icon) VALUES (?1, ?2, ?3, ?4)",
        params![item.id, item.name, item.parent_id, item.icon],
    )
    .map(|_| ())
}

fn write_credential(conn: &Connection, item: &CredentialItem, encrypted: &str) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO credentials (id, name, username, secret_type, secret_cipher, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            item.id,
            item.name,
            item.username,
            item.secret_type,
            encrypted,
            item.description
        ],
    )
    .map(|_| ())
}

fn write_host(conn: &Connection, item: &HostEntry) -> SqlResult<()> {
    let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "INSERT OR REPLACE INTO hosts (id, name, hostname, port, group_id, credential_id, tags_json, os, inject_aliases, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            item.id,
            item.name,
            item.hostname,
            item.port,
            item.group_id,
            item.credential_id,
            tags_json,
            item.os,
            if item.inject_aliases { 1 } else { 0 },
            item.notes
        ],
    )
    .map(|_| ())
}

fn write_snippet(conn: &Connection, item: &SnippetItem) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO snippets (id, name, command, category, description) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![item.id, item.name, item.command, item.category, item.description],
    )
    .map(|_| ())
}

fn write_alias(conn: &Connection, item: &AliasItem) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO aliases (id, alias, command, description, enabled) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            item.id,
            item.alias,
            item.command,
            item.description,
            if item.enabled { 1 } else { 0 }
        ],
    )
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> (tempfile::TempDir, DatabaseManager) {
        let dir = tempfile::tempdir().unwrap();
        let db = DatabaseManager::open(dir.path().to_path_buf(), [9u8; 32]).unwrap();
        (dir, db)
    }

    #[test]
    fn secrets_round_trip_and_are_not_stored_in_plaintext() {
        let (_d, db) = vault();
        let enc = db.encrypt_secret("hunter2").unwrap();
        assert!(!enc.contains("hunter2"));
        assert_eq!(db.decrypt_secret(&enc).unwrap(), "hunter2");
    }

    #[test]
    fn nonces_are_unique_per_encryption() {
        let (_d, db) = vault();
        assert_ne!(
            db.encrypt_secret("x").unwrap(),
            db.encrypt_secret("x").unwrap()
        );
    }

    #[test]
    fn wrong_key_fails_instead_of_returning_ciphertext() {
        let (_d, db) = vault();
        let enc = db.encrypt_secret("hunter2").unwrap();
        let other_dir = tempfile::tempdir().unwrap();
        let other = DatabaseManager::open(other_dir.path().to_path_buf(), [1u8; 32]).unwrap();
        assert!(other.decrypt_secret(&enc).is_err());
    }

    #[test]
    fn tampered_ciphertext_is_rejected() {
        let (_d, db) = vault();
        let enc = db.encrypt_secret("hunter2").unwrap();
        let mut raw = BASE64.decode(enc).unwrap();
        let last = raw.len() - 1;
        raw[last] ^= 0x01;
        assert!(db.decrypt_secret(&BASE64.encode(raw)).is_err());
    }

    #[test]
    fn import_replace_is_atomic_when_a_write_fails() {
        let (_d, db) = vault();
        db.upsert_host(HostEntry {
            id: "h1".into(),
            name: "web".into(),
            hostname: "10.0.0.5".into(),
            port: 22,
            group_id: "g1".into(),
            credential_id: "c1".into(),
            tags: vec![],
            os: None,
            inject_aliases: false,
            notes: None,
        })
        .unwrap();
        let before = db.load_snapshot().unwrap();
        assert_eq!(before.hosts.len(), 1);

        // Break the transaction midway by dropping a table the import needs.
        db.with_conn(|c| c.execute_batch("DROP TABLE aliases"))
            .unwrap();
        let snap = VaultSnapshot {
            groups: vec![],
            credentials: vec![],
            hosts: vec![],
            snippets: vec![],
            aliases: vec![AliasItem {
                id: "a".into(),
                alias: "ll".into(),
                command: "ls".into(),
                description: String::new(),
                enabled: true,
            }],
        };
        assert!(db.import_snapshot(snap, true).is_err());
        let hosts_after: i64 = db
            .with_conn(|c| c.query_row("SELECT COUNT(*) FROM hosts", [], |r| r.get(0)))
            .unwrap();
        assert_eq!(
            hosts_after as usize,
            before.hosts.len(),
            "failed import must roll back the wipe"
        );
    }

    #[test]
    fn fresh_vault_has_starter_content_but_no_hosts_or_credentials() {
        let (_d, db) = vault();
        let snap = db.load_snapshot().unwrap();
        assert!(snap.hosts.is_empty());
        assert!(snap.credentials.is_empty());
        assert!(snap.groups.is_empty());
        assert!(!snap.snippets.is_empty() && !snap.aliases.is_empty());
    }

    #[test]
    fn starters_are_seeded_only_once() {
        let dir = tempfile::tempdir().unwrap();
        let db = DatabaseManager::open(dir.path().to_path_buf(), [9u8; 32]).unwrap();
        for s in db.load_snapshot().unwrap().snippets {
            db.delete_snippet(&s.id).unwrap();
        }
        drop(db);
        let reopened = DatabaseManager::open(dir.path().to_path_buf(), [9u8; 32]).unwrap();
        assert!(reopened.load_snapshot().unwrap().snippets.is_empty());
    }
}
