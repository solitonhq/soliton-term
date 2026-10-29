# Security Policy & Architecture

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Architecture

**Soliton Term** is designed with a defense-in-depth security model for managing SSH credentials and remote terminal sessions:

1. **AES-256-GCM Encrypted Credential Vault (`src-tauri/src/db.rs`)**
   - All passwords and SSH private keys stored in the Vault are encrypted at rest using **AES-256-GCM** with unique 96-bit cryptographic nonces per secret.
   - Both `soliton_vault.sqlite3` and `.vault_master.key` are restricted to Unix `0600` (`rw-------`) file permissions inside a `0700` directory so no other local user can read them.

2. **SSH Argument & Shell Injection Protection (`src-tauri/src/ssh_pty.rs`)**
   - Hostnames and usernames are strictly validated (`is_safe_ssh_hostname` and `is_safe_ssh_username`), rejecting leading hyphens (`-`) or shell metacharacters.
   - OpenSSH is invoked with `--` prior to the `user@hostname` positional argument to prevent option-flag injection.
   - Temporary session alias names are validated against `^[a-zA-Z0-9_-]+$` and single-quoted payloads are escaped before in-memory PTY injection.

3. **Content Security Policy (CSP) (`src-tauri/tauri.conf.json`)**
   - Strict CSP (`default-src 'self'`) prevents unauthorized remote script execution inside the WebView.

4. **Safe Workspace Sharing (`ImportExportModal.tsx`)**
   - Exporting a workspace bundle allows unchecking *"Include Vault Passwords & SSH Private Keys"* so server hierarchies, tags, snippets, and aliases can be shared without exposing sensitive credentials.

## Reporting a Vulnerability

If you discover a security issue in Soliton Term, please open a private security advisory on GitHub or contact the maintainer directly before public disclosure.
