# Releasing

Releases are built and published by [`.github/workflows/release.yml`](../.github/workflows/release.yml) when a version
tag is pushed. Maintainers only.

1. **Pick the version** (`X.Y.Z`, SemVer) and set it in all three places:
   `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` (then run `cargo check` so `Cargo.lock`
   follows). `scripts/check-version.sh` verifies they agree; CI runs it.
2. **Update `CHANGELOG.md`**: move *Unreleased* under the new version with the date.
3. **Open a pull request** with those changes; merge it once CI is green.
4. **Tag the merge commit** and push the tag:
   ```bash
   git tag -s vX.Y.Z -m "Soliton Term X.Y.Z"   # or `git tag -a` if you have no signing key
   git push origin vX.Y.Z
   ```
   Tags with a suffix (`v0.2.0-rc1`) are published as pre-releases.
5. The workflow checks the tag against the version files, builds arm64 and x86_64, signs with the stable identity
   ([docs/SIGNING.md](SIGNING.md)), writes SHA-256 files, generates an SBOM, attests build provenance, and creates a
   **draft** release.
6. **Smoke-test the DMG** from the draft on a clean macOS user: install, clear quarantine, open, add a host, connect.
   Then publish the draft.

Required repository secrets: `SOLITON_SIGNING_P12`, `SOLITON_SIGNING_P12_PASSWORD`.
