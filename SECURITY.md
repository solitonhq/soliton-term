# Security policy

## Supported versions

Soliton Term is pre-1.0; security fixes are provided for the **latest release** only. Update to the latest release to
receive them.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately using GitHub's
[*Report a vulnerability*](https://github.com/solitonhq/soliton-term/security/advisories/new) form (Security tab →
Advisories). Include:

- the affected version and macOS version,
- a description and the impact (what could an attacker do?),
- steps or a proof of concept,
- any suggested fix.

## What to expect

- **Acknowledgement** within **5 working days**, and a first assessment (accepted, needs more information, or not a
  vulnerability) within **10 working days**.
- **A fix or mitigation** for confirmed high-severity issues within **30 days** where that is technically possible; others
  are scheduled by severity. We keep you informed of progress.
- **Coordinated disclosure**: we publish an advisory (and a CVE when appropriate) together with the fixed release. Please
  keep the details private until then; we ask for at most **90 days** from your report, and will say so if a fix needs longer.
- **Credit** in the advisory and release notes unless you prefer to stay anonymous.
- **Good faith**: research that follows this policy (no access to other people's data, no service disruption, no public
  disclosure before a fix) will not be met with legal action.

## Scope

In scope: the desktop application, the credential vault and its key handling, SSH/PTY session handling, workspace
import/export, and the release process (DMG integrity and signing).

Particularly interesting:

- leaking passwords, private keys or the vault master key (logs, files, UI, clipboard, network),
- command or argument injection into `ssh` or the local shell (hostnames, usernames, aliases, imported bundles),
- vault encryption or Keychain handling flaws,
- ways for imported data to corrupt or silently replace the vault,
- tampering with release artifacts.

Out of scope: vulnerabilities in OpenSSH, macOS or other third-party software themselves, and issues that require a
malicious *local* user who already controls your logged-in macOS account.

## Security design

1. **Encrypted credential vault** (`src-tauri/src/db.rs`, `vault_key.rs`)
   - Passwords and SSH private keys are encrypted at rest with **AES-256-GCM** using a unique random 96-bit nonce per
     secret. Tampered or wrong-key ciphertext is rejected; it is never returned as if it were the secret.
   - The master key is stored in the **macOS Keychain** (`com.soliton.term`), not on disk. Vaults created by early
     builds kept it in `.vault_master.key`; that file is migrated into the Keychain on first launch, then overwritten and
     deleted.
   - `soliton_vault.sqlite3` is `0600` inside a `0700` data directory.
   - Workspace imports are validated up-front and applied in a single SQLite transaction, so a bad bundle cannot leave a
     half-replaced vault.

2. **SSH argument and shell injection protection** (`src-tauri/src/ssh_pty.rs`, `validate.rs`)
   - Hostnames and usernames are validated when saved or imported and again before spawning `ssh`, rejecting leading
     hyphens and shell metacharacters. OpenSSH is invoked with `--` before the host argument.
   - Alias names are restricted to `[A-Za-z0-9_-]` and values are single-quote escaped before in-memory PTY injection.
   - All IPC payloads (IDs, lengths, control characters, secret types, bundle size) are validated in the backend; the
     WebView is not treated as a trust boundary.
   - SSH private keys are handed to OpenSSH through a randomly named file created `0600` from the start (no permission
     race), used with `IdentitiesOnly=yes`, and deleted when the session ends, when the app quits, and on the next launch if
     the app crashed.
   - The stored password is auto-typed only into OpenSSH's own `…password:` prompt, once, within 20 seconds of connecting.
     `sudo` prompts and banner text are not answered.

3. **Content Security Policy** (`src-tauri/tauri.conf.json`): `default-src 'self'` and no remote origins; the app has no
   network client of its own, no telemetry and no update check.

4. **Safe workspace sharing**: exporting a bundle can omit passwords and private keys, so hierarchies, tags, snippets and
   aliases can be shared without credentials.

## Known limitations

These are tracked in the [roadmap](ROADMAP.md) and worth knowing before you rely on Soliton Term:

- **Secrets are held in the WebView while the app runs.** The vault snapshot returned to the UI includes decrypted
  credentials (needed today for *Copy Password* and for starting sessions). The backend should resolve credentials by host
  ID and the UI should only receive secrets on explicit request.
- **No master password or lock screen.** Anyone with access to your unlocked macOS login session can use the Keychain item.
- **Exported bundles** that include passwords are plain JSON. Treat them like a password file.
- **`StrictHostKeyChecking=accept-new`** trusts a host on first connection (TOFU) and rejects changed keys afterwards.
- **Builds are signed with a self-signed identity and are not notarized.** macOS Gatekeeper warns on first launch
  (see the README); the stable identity keeps Keychain access working across updates. See
  [docs/SIGNING.md](docs/SIGNING.md).

## Verifying a download

Every release publishes, next to each DMG:

- a **SHA-256** checksum file: `shasum -a 256 -c SolitonTerm_<version>_<arch>.dmg.sha256`;
- a **build provenance attestation** that ties the DMG to the exact commit and workflow that built it:
  `gh attestation verify SolitonTerm_<version>_<arch>.dmg --repo solitonhq/soliton-term`;
- a **software bill of materials** (`SolitonTerm-sbom.cdx.json`, CycloneDX) listing every component.

Dependencies are scanned continuously (Dependabot, `cargo audit`, `npm audit`, CodeQL and dependency review in CI).
