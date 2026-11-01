## What and why

<!-- What does this change, and what problem does it solve? Link issues: "Fixes #123". -->

## How was it tested?

<!-- Tests added/updated, manual steps, macOS version. -->

## Checklist

- [ ] `npm run typecheck && npm test` passes
- [ ] `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` passes (in `src-tauri/`)
- [ ] Commits are signed off (`git commit -s`, see CONTRIBUTING.md)
- [ ] New behaviour has tests
- [ ] Touches credentials, the Keychain, SSH or the PTY? I considered SECURITY.md and described the impact below
- [ ] UI change: tried in Dark Black, Dark Blue and Light
- [ ] No secrets, private keys, tokens or private hostnames in code, tests or screenshots
- [ ] `CHANGELOG.md` updated for user-visible changes

## Security impact

<!-- "None" is a fine answer. Otherwise: what new data or input does this handle, and how is it validated? -->
