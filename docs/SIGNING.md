# Code signing

Soliton Term keeps its vault key in the macOS Keychain. macOS binds a Keychain item to the
**code signature** of the app that created it, so the signature must stay stable across
releases or macOS asks for Keychain access again after every update.

| Signature | Designated requirement | After an update |
| :--- | :--- | :--- |
| Ad-hoc (Tauri default, unsigned) | `cdhash H"…"` — changes every build | Keychain prompt every time |
| **Self-signed, stable identity (what we use)** | `identifier "com.soliton.term" and certificate root = H"<cert>"` | No prompt |
| Developer ID + notarization | Apple chain | No prompt, no Gatekeeper warning |

We verified this on a real Keychain: two different builds signed with the same certificate read
the item without a prompt, while an ad-hoc build of the same program blocked on one.

## What a self-signed identity does *not* do

It does not satisfy Gatekeeper. Users still run `xattr -cr "/Applications/Soliton Term.app"` once
after installing (see the README). Notarization needs an Apple Developer account ($99/year).

## Setup (once)

```bash
scripts/create-signing-identity.sh      # writes ~/.config/soliton-signing/{signing.p12,pass,…}
cargo install apple-codesign --locked --version 0.29.0   # provides `rcodesign`
```

**Back up `~/.config/soliton-signing/`.** If the identity is lost or replaced, the next release has a
different identity and users get one more Keychain prompt (their data is not affected).

## Local build

```bash
scripts/package-macos.sh        # builds, signs, writes src-tauri/target/release/bundle/dmg/*.dmg
```

## Releases

The release workflow signs with two repository secrets:

| Secret | Value |
| :--- | :--- |
| `SOLITON_SIGNING_P12` | `base64 -i ~/.config/soliton-signing/signing.p12` |
| `SOLITON_SIGNING_P12_PASSWORD` | contents of `~/.config/soliton-signing/pass` |

## How the key is protected in CI

The key can sign an app that macOS will let read the vault key from users' Keychains, so it is treated as sensitive:

- It lives only in the `release` **environment**, which only `v*` tags may deploy to. Tags can only be created by repository
  admins and can never be moved or deleted (repository ruleset). Pull requests and forks cannot read it.
- It is exposed to **one step** only: signing. The build step runs every dependency's build scripts, so it gets no secrets
  (`package-macos.sh --build-only` vs `--sign-only`). The signing step runs the pinned `rcodesign` and `hdiutil`.
- The `.p12` is written to the runner's temp directory and deleted right after signing; GitHub masks the values in logs.
- All actions are pinned to commit SHAs and `rcodesign` is built from crates.io at a pinned version with its lockfile.

If the key is ever exposed: delete the secrets, run `scripts/create-signing-identity.sh` again (after moving the old
directory away), update the secrets and publish a release. Users then get one Keychain prompt; their data is unaffected.

## Moving to Developer ID later

Sign and notarize with the Apple certificate instead. The Keychain item created under the
self-signed identity will prompt once after that switch; after it, updates are silent.
