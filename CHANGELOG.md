# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First public release.

### Added
- Hybrid SSH & remote server manager: Termius-style tabs and terminal, RDM-style folder tree and vault.
- Keychain-backed AES-256-GCM credential vault (passwords and SSH keys) in a local SQLite database.
- Multi-exec broadcast, parametric snippets (`{{variables}}`), session-only alias injection, ⌘K command palette.
- Workspace export/import (secrets optional) with all-or-nothing, validated imports.
- Welcome screen for an empty vault; live tab connection status; persisted theme, font and sidebar preferences.
- New brand identity: vector logo and wordmark (stacked + horizontal), app icon, light/dark variants.
- CI (typecheck, tests, fmt, clippy) and tagged release workflow for macOS arm64 and x86_64.

### Security
- Vault master key stored in the macOS Keychain; legacy `.vault_master.key` is migrated and shredded.
- Decryption fails loudly; no silent empty writes or ciphertext returned as secrets.
- Backend validation of every IPC payload and imported bundle.
- Ephemeral SSH key files are `0600` at creation, randomly named and removed on session end, quit and next launch.
- Password auto-fill answers only OpenSSH's own prompt, once, shortly after connecting.
- Fixed a UTF-8 boundary panic and split multi-byte characters in terminal output.
- `ssh` to `localhost`/`127.0.0.1` now uses SSH instead of silently opening a local shell.
