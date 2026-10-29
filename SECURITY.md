# Security Policy & Architecture

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Architecture

**Soliton Term** is designed with a defense-in-depth security model for managing SSH credentials and remote terminal sessions:

1. **Encrypted Credential Vault (`src-tauri/src/db.rs`, `vault_key.rs`)**
   - Passwords and SSH private keys are encrypted at rest with **AES-256-GCM** using a unique random 96-bit nonce per secret. Tampered or wrong-key ciphertext is rejected; it is never returned as if it were the secret.
   - The master key is stored in the **macOS Keychain** (`com.soliton.term`), not on disk. Vaults created by earlier builds keep the key in `.vault_master.key`; it is migrated into the Keychain on first launch and then overwritten and deleted.
   - `soliton_vault.sqlite3` is `0600` inside a `0700` data directory.
   - Workspace imports are validated up-front and applied in a single SQLite transaction, so a bad bundle cannot leave a half-replaced vault.

2. **SSH Argument & Shell Injection Protection (`src-tauri/src/ssh_pty.rs`, `validate.rs`)**
   - Hostnames and usernames are validated both when saved/imported and again before spawning `ssh`, rejecting leading hyphens and shell metacharacters. OpenSSH is invoked with `--` before the host argument.
   - Alias names are restricted to `[A-Za-z0-9_-]` and values are single-quote escaped before in-memory PTY injection.
   - All IPC payloads (IDs, lengths, control characters, secret types, bundle size) are validated in the backend; the WebView is not treated as a trust boundary.
   - SSH private keys are handed to OpenSSH through a randomly named file created `0600` from the start (no permission race), used with `IdentitiesOnly=yes`, and deleted when the session ends, when the app quits, and on the next launch if the app crashed.
   - The stored password is auto-typed only into OpenSSH's own `...password:` prompt, once, within 20 seconds of connecting. `sudo` prompts and banner text are not answered.

3. **Content Security Policy (CSP) (`src-tauri/tauri.conf.json`)**
   - Strict CSP (`default-src 'self'`) prevents unauthorized remote script execution inside the WebView.

4. **Safe Workspace Sharing (`ImportExportModal.tsx`)**
   - Exporting a workspace bundle allows unchecking *"Include Vault Passwords & SSH Private Keys"* so server hierarchies, tags, snippets, and aliases can be shared without exposing sensitive credentials.

## Known Limitations

These are tracked for upcoming releases and are worth knowing before you rely on Soliton Term:

- **Secrets are held in the WebView while the app runs.** The vault snapshot returned to the UI includes decrypted credentials (needed today for the Copy Password button and for starting sessions). The backend should resolve credentials by host ID and the UI should only receive secrets on explicit request.
- **No master password / lock screen.** Anyone with access to your unlocked macOS login session can use the Keychain item. A user-supplied master password is planned.
- **Exported bundles** with *Include Vault Passwords* checked are plain JSON. Treat them like a password file.
- **`StrictHostKeyChecking=accept-new`** trusts a host on first connection (TOFU) and rejects changed keys afterwards.
- **Builds are not notarized** unless a release says otherwise. Verify checksums of downloaded builds.

## Reporting a Vulnerability

If you discover a security issue in Soliton Term, please open a private security advisory on GitHub or contact the maintainer directly before public disclosure.
