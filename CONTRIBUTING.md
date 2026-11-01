# Contributing to Soliton Term

First off, thank you for considering contributing to **Soliton Term**! 🚀

**Soliton Term** is a next-generation, native macOS SSH & Remote Server Manager built with **Tauri v2 (Rust)**, **React 18**, **TypeScript**, and **xterm.js**. It combines the sleek, modern terminal UX of **Termius** with the enterprise folder hierarchy, credential vaulting, and multi-session broadcast capabilities of **Remote Desktop Manager (RDM)**.

Whether you are fixing a bug, proposing a new feature, improving terminal performance, or designing a new color theme, your contributions are welcome!

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites & Development Setup](#prerequisites--development-setup)
4. [Running the Checks](#running-the-checks)
5. [Project Structure](#project-structure)
6. [Security & Cryptography Standards](#security--cryptography-standards)
7. [UI/UX & Theme Guidelines](#uiux--theme-guidelines)
8. [Adding Custom Terminal Themes](#adding-custom-terminal-themes)
9. [Sign-off (DCO) and licensing](#sign-off-dco-and-licensing)
10. [Commit Message & Pull Request Guidelines](#commit-message--pull-request-guidelines)

---

## Code of Conduct

We are committed to providing a welcoming, respectful, and harassment-free experience for everyone in our open-source community. Please be constructive in code reviews, issues, and discussions. The full text is in [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

---

## Architecture Overview

Soliton Term is divided into two tightly integrated layers:

1. **Native Rust Core (`src-tauri/`)**
   - **PTY & SSH Session Engine (`ssh_pty.rs`):** Spawns real macOS pseudo-terminals (`portable-pty`) running OpenSSH (`/usr/bin/ssh`) or local shells (`/bin/zsh`). Answers OpenSSH's own password prompt once, and materializes an ephemeral `0600` key file that is removed when the session ends.
   - **Encrypted SQLite Vault (`db.rs`):** Persists hierarchical folders, servers, credentials, parametric snippets, and temporary session aliases in a local SQLite database (`soliton_vault.sqlite3`). All sensitive secrets (SSH passwords and private keys) are encrypted at rest using **AES-256-GCM** with a master key held in the macOS Keychain (`vault_key.rs`). Everything the WebView sends is validated in `validate.rs`.

2. **Reactive Frontend (`src/`)**
   - **State & Persistence Bridge (`store/useAppStore.ts`):** Powered by **Zustand**, synchronizing UI state with Tauri IPC commands (`load_vault_snapshot`, `save_host`, `save_group`, `save_credential`, etc.).
   - **Multi-Tab & Multi-Server Broadcast Terminal (`components/TerminalWorkspace.tsx`):** High-performance `xterm.js` instances with WebGL/Canvas rendering, real-time resize fitting, and simultaneous keystroke/snippet broadcasting across multiple servers.

---

## Prerequisites & Development Setup

To build and run Soliton Term locally on macOS, ensure you have the following installed:

- **macOS 12.0+** (Apple Silicon `aarch64` or Intel `x86_64`)
- **Xcode Command Line Tools:**
  ```bash
  xcode-select --install
  ```
- **Node.js 20+** & **npm**
- **Rust toolchain** (stable, via `rustup`):
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

### Step-by-Step Local Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/soliton-term.git
   cd soliton-term
   ```

2. **Install frontend dependencies:**
   ```bash
   npm ci
   ```

3. **Verify TypeScript types and frontend production bundle:**
   ```bash
   npm run build
   ```

4. **Verify Rust backend compilation:**
   ```bash
   cd src-tauri && cargo check && cd ..
   ```

5. **Run in interactive development mode (with Hot Module Replacement):**
   ```bash
   npm run tauri dev
   ```

6. **Build the native macOS `.app` and `.dmg` installer** (unsigned; see [`docs/SIGNING.md`](./docs/SIGNING.md) for the signed build):
   ```bash
   npm run tauri build
   ```

---

## Running the Checks

CI runs the same commands; please run them before opening a pull request:

```bash
npm run typecheck && npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

The real-Keychain test is opt-in: `cargo test -- --ignored real_keychain`.

---

## Project Structure

```text
soliton-term/
├── public/                        # Brand logos & typographic wordmarks
├── src/
│   ├── components/
│   │   ├── CommandPaletteModal.tsx          # Cmd+K quick launcher for hosts, snippets & actions
│   │   ├── ImportExportModal.tsx            # JSON Vault export/import (sanitized or full)
│   │   ├── ParametricSnippetRunnerModal.tsx # Dynamic {{variable}} snippet execution modal
│   │   ├── Sidebar.tsx                      # Resizable tree view, pointer drag-and-drop, Vault/Snippets/Aliases
│   │   ├── TerminalWorkspace.tsx            # xterm.js multi-tab workspace & Broadcast bar
│   │   ├── TopBar.tsx                       # Quick credential copy, search, theme & terminal controls
│   │   └── VaultModalManager.tsx            # CRUD modals for Hosts, Folders, Credentials, Snippets & Aliases
│   ├── store/
│   │   └── useAppStore.ts                   # Central Zustand store & Tauri IPC bridge
│   ├── themes/
│   │   └── terminalThemes.ts                # 16+ curated dark & light terminal color schemes
│   ├── App.tsx                              # Root layout & global keyboard shortcuts
│   └── index.css                            # Semantic theme CSS variables (Dark Black, Dark Blue, Light)
└── src-tauri/
    ├── src/
    │   ├── db.rs                            # SQLite schema, AES-256-GCM encryption, atomic import
    │   ├── vault_key.rs                     # Master key in the macOS Keychain (+ legacy file migration)
    │   ├── validate.rs                      # Backend validation of every IPC payload / import
    │   ├── ssh_pty.rs                       # PTY manager, ephemeral key files, password-prompt detection
    │   ├── lib.rs                           # Tauri IPC command handlers
    │   └── main.rs                          # Binary entry point
    ├── Cargo.toml                           # Rust dependencies
    └── tauri.conf.json                      # Window configuration, CSP & bundle settings
```

---

## Security & Cryptography Standards

Because Soliton Term manages production infrastructure credentials, every contribution **must** adhere to strict security practices:

1. **Zero plaintext secrets at rest:** never store raw passwords or private keys in `localStorage`, plain JSON files or unencrypted SQLite columns. Secrets go through `encrypt_secret` / `decrypt_secret` (AES-256-GCM) in [`src-tauri/src/db.rs`](./src-tauri/src/db.rs); the key stays in the Keychain.
2. **Strict file permissions (`0600`)** for any file with key material (the vault, ephemeral SSH identity files); create them with the right mode from the start instead of chmod-ing afterwards.
3. **Validate in the backend:** every new IPC command that accepts data must validate it in [`validate.rs`](./src-tauri/src/validate.rs) with tests. The WebView is not a trust boundary.
4. **SSH injection prevention:** never build shell strings from hostnames or usernames. Pass discrete arguments to `/usr/bin/ssh` (`-p`, `-l`, `--`, `<hostname>`) and reject leading dashes and whitespace.
5. **Fail loudly:** no silent fallbacks for crypto or Keychain errors (never return ciphertext as a secret, never write an empty secret on failure).
6. **Sanitized logging:** never log `secretValue`, key material or PTY authentication buffers (`println!`, `dbg!`, `console.log`).

If you discover a security vulnerability, please refer to [`SECURITY.md`](./SECURITY.md) rather than opening a public issue.

---

## UI/UX & Theme Guidelines

- **Minimalist, High-Signal Interface:** Avoid visual clutter. Keep action buttons concise, use subtle hover states, and prioritize terminal screen real estate.
- **Theme Compatibility:** Soliton Term ships with **Dark Black (OLED)** as the default theme, alongside **Dark Blue** and **Light** modes.
  - Always use semantic Tailwind classes (`bg-app-bg`, `bg-app-sidebar`, `bg-app-panel`, `bg-app-hover`, `text-app-text`, `text-app-muted`, `border-app-border`, `text-app-accent`) rather than hardcoded colors so your UI looks great across all three themes.
- **macOS WebKit (`WKWebView`) Compatibility:**
  - Avoid relying on browser-specific quirks. Note that pointer/mouse-based interactions are preferred over native HTML5 `draggable` due to `WKWebView` `user-select: none` constraints.

---

## Adding Custom Terminal Themes

Terminal color schemes are defined in [`src/themes/terminalThemes.ts`](./src/themes/terminalThemes.ts). To contribute a new terminal theme:

1. Open `src/themes/terminalThemes.ts`.
2. Add a new `TerminalThemePreset` entry with a unique `id`, human-readable `name`, `category` (`"dark"` or `"light"`), and a full `xterm.js` `ITheme` palette (`background`, `foreground`, `cursor`, `selectionBackground`, and ANSI colors `black` through `brightWhite`).
3. Test your theme in both normal and broadcast terminal views.

---

## Sign-off (DCO) and licensing

Contributions are accepted under the [Developer Certificate of Origin](https://developercertificate.org) (DCO): by adding a
`Signed-off-by` line you certify that you wrote the change or have the right to submit it under the project's license.
There is no CLA to sign. Add the line with:

```bash
git commit -s -m "fix(ssh): handle usernames containing @"
```

If you forgot, fix existing commits with:

```bash
git rebase --signoff main && git push --force-with-lease
```

The `DCO` check on every pull request verifies it.

The project is licensed under the [Apache License 2.0](LICENSE). By submitting a contribution you agree that it is
licensed under the same terms (Section 5 of the license). Only submit code you wrote or have the right to contribute, and
keep third-party code's original license headers. If you add a dependency, make sure its license is permissive (MIT, BSD,
ISC, Zlib, Apache-2.0) and run `python3 scripts/gen_notices.py` to refresh
[`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt). The names and logos of Soliton are not covered by the license
(see [`NOTICE`](NOTICE)).

---

## Commit Message & Pull Request Guidelines

### Commit convention
We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add one-click host duplication in sidebar`
- `fix(ssh): support domain usernames containing @ symbol`
- `security(vault): enforce 0600 permissions on SQLite vault file`
- `docs: expand contributing guide and architecture overview`

`main` has a linear history and pull requests are **squash-merged**, so the pull request title becomes the commit message:
make it a Conventional Commit.

### Pull request checklist
Fill in the template. In short:
- [ ] `npm run typecheck && npm test` and the Rust checks above pass.
- [ ] Commits are signed off (`git commit -s`).
- [ ] UI changes were tried in **Dark Black**, **Dark Blue** and **Light**.
- [ ] No real credentials, IP addresses, private keys or private hostnames in code, tests or screenshots.
- [ ] Changes to credentials, SSH or the PTY come with tests and a note on the security impact.

Thank you for helping make **Soliton Term** better!
