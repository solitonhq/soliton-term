# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-01

First public release. macOS 12 or later (developed and tested on macOS 15), Apple Silicon and Intel.

### Added
- SSH and remote server manager: tabs and a native terminal (xterm.js) on top of the system OpenSSH, a folder tree with
  drag and drop, and a credential vault.
- Keychain-backed vault: passwords and SSH private keys are encrypted with AES-256-GCM in a local SQLite database; the master
  key lives in the macOS Keychain.
- Multi-exec broadcast to selected tabs or whole folders, parametric snippets (`{{variables}}`), session-only alias
  injection (nothing is written to the remote host) and a ⌘K command palette.
- Workspace export/import with optional secrets; imports are validated and applied all-or-nothing.
- Quick-copy bar for the selected host's username, password and `host:port`; recent sessions; three app themes and
  eleven terminal palettes; welcome screen, live connection status and persisted preferences.
- Releases are built in CI, signed with a stable identity, and published with SHA-256 checksums, a CycloneDX SBOM and a
  build provenance attestation (see `SECURITY.md`).

### Security
- Master key in the Keychain; early-build `.vault_master.key` files are migrated and shredded.
- Decryption fails loudly: no silent empty writes, no ciphertext returned as a secret.
- Every IPC payload and imported bundle is validated in the backend.
- Ephemeral SSH key files are `0600` from creation, randomly named, and removed on session end, quit and next launch.
- The stored password is auto-typed only into OpenSSH's own prompt, once, shortly after connecting.

### Known limitations
Not notarized (macOS shows a Gatekeeper warning on first launch); decrypted secrets are held in the WebView while the app
runs; no master password yet. Details and plans: [`SECURITY.md`](SECURITY.md), [`ROADMAP.md`](ROADMAP.md).

[0.1.0]: https://github.com/solitonhq/soliton-term/releases/tag/v0.1.0
