use crate::vault_key;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
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
        manager.seed_if_empty().map_err(|e| e.to_string())?;
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
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
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

    fn seed_if_empty(&self) -> SqlResult<()> {
        let count: i64 = {
            let conn = self
                .conn
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            conn.query_row("SELECT COUNT(*) FROM hosts", [], |r| r.get(0))?
        };
        if count > 0 {
            return Ok(());
        }

        // Seed default groups
        self.upsert_group(HostGroup {
            id: "grp-prod".into(),
            name: "Production Cluster".into(),
            parent_id: None,
            icon: None,
        })?;
        self.upsert_group(HostGroup {
            id: "grp-prod-k8s".into(),
            name: "Kubernetes Nodes".into(),
            parent_id: Some("grp-prod".into()),
            icon: None,
        })?;
        self.upsert_group(HostGroup {
            id: "grp-prod-db".into(),
            name: "Database Replicas".into(),
            parent_id: Some("grp-prod".into()),
            icon: None,
        })?;
        self.upsert_group(HostGroup {
            id: "grp-stage".into(),
            name: "Staging & QA".into(),
            parent_id: None,
            icon: None,
        })?;
        self.upsert_group(HostGroup {
            id: "grp-dmz".into(),
            name: "DMZ / Edge Gateways".into(),
            parent_id: None,
            icon: None,
        })?;

        // Seed encrypted demo credentials (safe placeholders for open-source distribution)
        self.upsert_credential(CredentialItem {
            id: "cred-root-prod".into(),
            name: "Prod Root Vault Key".into(),
            username: "root".into(),
            secret_type: "password".into(),
            secret_value: "<DEMO_ROOT_PASSWORD_CHANGE_ME>".into(),
            description: Some(
                "Primary production root access credential (Demo placeholder)".into(),
            ),
        })?;
        self.upsert_credential(CredentialItem {
            id: "cred-devops".into(),
            name: "DevOps Automation User".into(),
            username: "soliton_ops".into(),
            secret_type: "password".into(),
            secret_value: "<DEMO_OPS_PASSWORD_CHANGE_ME>".into(),
            description: Some(
                "Standard SRE & Kubernetes operator account (Demo placeholder)".into(),
            ),
        })?;
        self.upsert_credential(CredentialItem {
            id: "cred-db-admin".into(),
            name: "PostgreSQL Cluster Admin".into(),
            username: "pgadmin".into(),
            secret_type: "ssh_key".into(),
            secret_value: "<SSH_ED25519_PRIVATE_KEY_PLACEHOLDER>".into(),
            description: Some("SSH key for DB replica servers (Demo placeholder)".into()),
        })?;

        // Seed hosts
        self.upsert_host(HostEntry {
            id: "host-1".into(),
            name: "k8s-master-01".into(),
            hostname: "10.240.10.11".into(),
            port: 22,
            group_id: "grp-prod-k8s".into(),
            credential_id: "cred-devops".into(),
            tags: vec!["prod".into(), "k8s".into(), "control-plane".into()],
            os: Some("kubernetes".into()),
            inject_aliases: true,
            notes: Some("Primary Kubernetes API server".into()),
        })?;
        self.upsert_host(HostEntry {
            id: "host-2".into(),
            name: "k8s-worker-gpu-01".into(),
            hostname: "10.240.10.21".into(),
            port: 22,
            group_id: "grp-prod-k8s".into(),
            credential_id: "cred-devops".into(),
            tags: vec!["prod".into(), "k8s".into(), "worker".into(), "gpu".into()],
            os: Some("linux".into()),
            inject_aliases: true,
            notes: Some("High-memory GPU worker node".into()),
        })?;
        self.upsert_host(HostEntry {
            id: "host-3".into(),
            name: "pg-primary-db01".into(),
            hostname: "10.240.20.5".into(),
            port: 2222,
            group_id: "grp-prod-db".into(),
            credential_id: "cred-db-admin".into(),
            tags: vec!["prod".into(), "database".into(), "postgres".into()],
            os: Some("ubuntu".into()),
            inject_aliases: true,
            notes: Some("Primary PostgreSQL 16 instance".into()),
        })?;

        // Seed snippets
        self.upsert_snippet(SnippetItem {
            id: "snip-1".into(),
            name: "System Health & Resource Check".into(),
            command: "uptime && free -h && df -hT | grep -v tmpfs".into(),
            category: "Diagnostics".into(),
            description: "Quick overview of CPU load, RAM, and disk usage".into(),
        })?;
        self.upsert_snippet(SnippetItem {
            id: "snip-2".into(),
            name: "Kubernetes Pod CrashLoop Finder".into(),
            command: "kubectl get pods -A --field-selector=status.phase!=Running".into(),
            category: "Kubernetes".into(),
            description: "List all non-running pods across all namespaces".into(),
        })?;

        // Seed temporary aliases
        self.upsert_alias(AliasItem {
            id: "al-1".into(),
            alias: "ll".into(),
            command: "ls -lah --color=auto".into(),
            description: "Detailed human-readable directory listing".into(),
            enabled: true,
        })?;
        self.upsert_alias(AliasItem {
            id: "al-2".into(),
            alias: "k".into(),
            command: "kubectl".into(),
            description: "Shorthand for kubectl CLI".into(),
            enabled: true,
        })?;
        self.upsert_alias(AliasItem {
            id: "al-3".into(),
            alias: "dcu".into(),
            command: "docker compose up -d".into(),
            description: "Start docker compose stack in detached mode".into(),
            enabled: true,
        })?;

        Ok(())
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
        let before = db.load_snapshot().unwrap();
        assert!(
            !before.hosts.is_empty(),
            "seed data expected until onboarding lands"
        );

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
}
