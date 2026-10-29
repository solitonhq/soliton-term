# Contributing to Soliton Term

First off, thank you for considering contributing to **Soliton Term**! 🚀

**Soliton Term** is a next-generation, native macOS SSH & Remote Server Manager built with **Tauri v2 (Rust)**, **React 18**, **TypeScript**, and **xterm.js**. It combines the sleek, modern terminal UX of **Termius** with the enterprise folder hierarchy, credential vaulting, and multi-session broadcast capabilities of **Remote Desktop Manager (RDM)**.

Whether you are fixing a bug, proposing a new feature, improving terminal performance, or designing a new color theme, your contributions are welcome!

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites & Development Setup](#prerequisites--development-setup)
4. [Project Structure](#project-structure)
5. [Security & Cryptography Standards](#security--cryptography-standards)
6. [UI/UX & Theme Guidelines](#uiux--theme-guidelines)
7. [Adding Custom Terminal Themes](#adding-custom-terminal-themes)
8. [Commit Message & Pull Request Guidelines](#commit-message--pull-request-guidelines)

---

## Code of Conduct

We are committed to providing a welcoming, respectful, and harassment-free experience for everyone in our open-source community. Please be constructive in code reviews, issues, and discussions.

---

## Architecture Overview

Soliton Term is divided into two tightly integrated layers:

1. **Native Rust Core (`src-tauri/`)**
   - **PTY & SSH Session Engine (`ssh_pty.rs`):** Spawns real macOS pseudo-terminals (`portable-pty`) running OpenSSH (`/usr/bin/ssh`) or local shells (`/bin/zsh`). Automatically handles SSH password prompts, passphrase prompts, host key verification, and temporary Ephemeral SSH Key (`0600`) materialization.
   - **Encrypted SQLite Vault (`db.rs`):** Persists hierarchical folders, servers, credentials, parametric snippets, and temporary session aliases in a local SQLite database (`soliton_vault.sqlite3`). All sensitive secrets (SSH passwords and private keys) are encrypted at rest using **AES-256-GCM** with a master key held in the macOS Keychain.

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
- **Node.js (v18+ or v20+ LTS)** & **npm**
- **Rust Toolchain (`rustup`, `cargo`, `rustc` 1.77+):**
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
   npm install
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

6. **Build the native macOS `.app` and `.dmg` installer:**
   ```bash
   npm run tauri build
   ```

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
    │   ├── db.rs                            # SQLite schema & AES-256-GCM encryption/decryption
    │   ├── ssh_pty.rs                       # Native PTY process manager & SSH auto-authentication
    │   ├── lib.rs                           # Tauri IPC command handlers
    │   └── main.rs                          # Binary entry point
    ├── Cargo.toml                           # Rust dependencies
    └── tauri.conf.json                      # Window configuration, CSP & bundle settings
```

---

## Security & Cryptography Standards

Because Soliton Term manages production infrastructure credentials, every contribution **must** adhere to strict security practices:

1. **Zero Plaintext Secrets at Rest:**
   - Never store raw passwords or private keys in `localStorage`, unencrypted JSON files, or unencrypted SQLite columns. All secrets must pass through `encrypt_secret` / `decrypt_secret` (`AES-256-GCM`) in [`src-tauri/src/db.rs`](./src-tauri/src/db.rs).
2. **Strict File Permissions (`0600`):**
   - Any file containing key material (such as `.vault_master.key`, `soliton_vault.sqlite3`, or temporary SSH identity files in `/tmp`) must enforce `0600` permissions (`rw-------`) on Unix.
3. **SSH Command Injection Prevention:**
   - Never construct shell strings with unescaped user hostnames or usernames. Always pass arguments as discrete array elements to `/usr/bin/ssh` (`-p`, `-l`, `--`, `<hostname>`) and validate hostnames/usernames against leading dashes (`-`) or whitespace.
4. **Sanitized Logging:**
   - Never log `secretValue`, `secret_data`, or PTY authentication buffers via `println!`, `dbg!`, or `console.log`.

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

## Commit Message & Pull Request Guidelines

### Commit Convention
We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add one-click host duplication in sidebar`
- `fix(ssh): support domain usernames containing @ symbol`
- `sec(vault): enforce 0600 permissions on SQLite vault file`
- `ui(sidebar): add subfolder creation option to folder + menu`
- `docs: expand contributing guide and architecture overview`

### Pull Request Checklist
Before submitting a Pull Request, please verify that:
- [ ] `npm run build` completes with zero TypeScript or Vite errors.
- [ ] `cargo check` inside `src-tauri/` passes with zero errors.
- [ ] UI changes have been tested in **Dark Black**, **Dark Blue**, and **Light** themes.
- [ ] No real credentials, IP addresses, or private keys are included in your commits.

Thank you for helping make **Soliton Term** the best open-source SSH & Remote Server Manager for macOS! ❤️
