//! Vault master-key storage.
//!
//! The AES-256 key that protects the credential vault lives in the macOS
//! Keychain. Earlier builds kept it in `.vault_master.key` next to the
//! database, which made the encryption little more than obfuscation; that file
//! is migrated into the Keychain on first launch and then securely removed.

use rand::RngCore;
use std::fs;
use std::path::Path;

pub const KEY_LEN: usize = 32;
const KEYCHAIN_SERVICE: &str = "com.soliton.term";
const KEYCHAIN_ACCOUNT: &str = "vault-master-key";
const LEGACY_KEY_FILE: &str = ".vault_master.key";

/// Where the master key is persisted. Abstracted so the migration logic can be
/// unit-tested without touching the real Keychain.
pub trait KeyBackend {
    fn get(&self) -> Result<Option<Vec<u8>>, String>;
    fn set(&self, key: &[u8]) -> Result<(), String>;
}

pub struct KeychainBackend {
    account: String,
}

impl Default for KeychainBackend {
    fn default() -> Self {
        Self {
            account: KEYCHAIN_ACCOUNT.to_string(),
        }
    }
}

impl KeychainBackend {
    #[cfg(test)]
    fn with_account(account: &str) -> Self {
        Self {
            account: account.to_string(),
        }
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYCHAIN_SERVICE, &self.account)
            .map_err(|e| format!("Keychain unavailable: {e}"))
    }
}

impl KeyBackend for KeychainBackend {
    fn get(&self) -> Result<Option<Vec<u8>>, String> {
        match self.entry()?.get_secret() {
            Ok(bytes) => Ok(Some(bytes)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to read vault key from Keychain: {e}")),
        }
    }

    fn set(&self, key: &[u8]) -> Result<(), String> {
        self.entry()?
            .set_secret(key)
            .map_err(|e| format!("Failed to store vault key in Keychain: {e}"))
    }
}

fn read_legacy_key(path: &Path) -> Option<[u8; KEY_LEN]> {
    let bytes = fs::read(path).ok()?;
    <[u8; KEY_LEN]>::try_from(bytes.as_slice()).ok()
}

/// Overwrite with zeros before unlinking so the key does not linger in the
/// file's old blocks any longer than necessary.
fn shred_legacy_key(path: &Path) {
    if let Ok(meta) = fs::metadata(path) {
        let _ = fs::write(path, vec![0u8; meta.len() as usize]);
    }
    let _ = fs::remove_file(path);
}

/// Returns the vault master key, creating it on first run.
///
/// Never overwrites an existing Keychain entry: a malformed entry is an error
/// rather than a reason to silently generate a new key, which would make every
/// stored credential undecryptable.
pub fn load_or_create_key(
    app_dir: &Path,
    backend: &dyn KeyBackend,
) -> Result<[u8; KEY_LEN], String> {
    let legacy_path = app_dir.join(LEGACY_KEY_FILE);
    let legacy = read_legacy_key(&legacy_path);

    match backend.get()? {
        Some(bytes) => {
            let key = <[u8; KEY_LEN]>::try_from(bytes.as_slice())
                .map_err(|_| "Vault key in Keychain has an unexpected length".to_string())?;
            if legacy == Some(key) {
                shred_legacy_key(&legacy_path);
            }
            Ok(key)
        }
        None => {
            let key = legacy.unwrap_or_else(|| {
                let mut k = [0u8; KEY_LEN];
                rand::thread_rng().fill_bytes(&mut k);
                k
            });
            backend.set(&key)?;
            // Only drop the legacy file once the Keychain demonstrably holds the key.
            if backend.get()?.as_deref() != Some(&key[..]) {
                return Err("Vault key could not be verified in Keychain".to_string());
            }
            if legacy.is_some() {
                shred_legacy_key(&legacy_path);
            }
            Ok(key)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct MemBackend(RefCell<Option<Vec<u8>>>);

    impl KeyBackend for MemBackend {
        fn get(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(self.0.borrow().clone())
        }
        fn set(&self, key: &[u8]) -> Result<(), String> {
            *self.0.borrow_mut() = Some(key.to_vec());
            Ok(())
        }
    }

    /// Exercises the real macOS Keychain with a throw-away account.
    /// Run with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn real_keychain_round_trip() {
        let backend = KeychainBackend::with_account("test-vault-key-roundtrip");
        let dir = tempfile::tempdir().unwrap();
        let key = load_or_create_key(dir.path(), &backend).unwrap();
        assert_eq!(load_or_create_key(dir.path(), &backend).unwrap(), key);
        backend.entry().unwrap().delete_credential().unwrap();
    }

    #[test]
    fn generates_and_persists_key_on_first_run() {
        let dir = tempfile::tempdir().unwrap();
        let backend = MemBackend::default();
        let key = load_or_create_key(dir.path(), &backend).unwrap();
        assert_eq!(backend.get().unwrap().unwrap(), key.to_vec());
        assert_eq!(load_or_create_key(dir.path(), &backend).unwrap(), key);
    }

    #[test]
    fn migrates_legacy_file_into_backend_and_removes_it() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = [7u8; KEY_LEN];
        let path = dir.path().join(LEGACY_KEY_FILE);
        fs::write(&path, legacy).unwrap();

        let backend = MemBackend::default();
        let key = load_or_create_key(dir.path(), &backend).unwrap();

        assert_eq!(key, legacy);
        assert_eq!(backend.get().unwrap().unwrap(), legacy.to_vec());
        assert!(
            !path.exists(),
            "legacy key file must be removed after migration"
        );
    }

    #[test]
    fn keychain_key_wins_over_a_different_legacy_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(LEGACY_KEY_FILE);
        fs::write(&path, [1u8; KEY_LEN]).unwrap();
        let backend = MemBackend::default();
        backend.set(&[2u8; KEY_LEN]).unwrap();

        let key = load_or_create_key(dir.path(), &backend).unwrap();
        assert_eq!(key, [2u8; KEY_LEN]);
        assert!(
            path.exists(),
            "a non-matching legacy file is left for manual review"
        );
    }

    #[test]
    fn malformed_keychain_entry_is_an_error_not_a_reset() {
        let dir = tempfile::tempdir().unwrap();
        let backend = MemBackend::default();
        backend.set(&[1u8; 5]).unwrap();
        assert!(load_or_create_key(dir.path(), &backend).is_err());
        assert_eq!(backend.get().unwrap().unwrap(), vec![1u8; 5]);
    }
}
