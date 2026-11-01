#!/usr/bin/env bash
# Fails when package.json, Cargo.toml and tauri.conf.json disagree on the version.
# With a tag argument (v1.2.3 or 1.2.3) it also checks the tag matches.
set -euo pipefail
cd "$(dirname "$0")/.."
pkg=$(python3 -c 'import json;print(json.load(open("package.json"))["version"])')
tauri=$(python3 -c 'import json;print(json.load(open("src-tauri/tauri.conf.json"))["version"])')
cargo=$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)
echo "package.json=$pkg  Cargo.toml=$cargo  tauri.conf.json=$tauri"
[ "$pkg" = "$cargo" ] && [ "$pkg" = "$tauri" ] || { echo "::error::version mismatch" >&2; exit 1; }
if [ -n "${1:-}" ]; then
  tag="${1#v}"
  [ "$tag" = "$pkg" ] || { echo "::error::tag $1 does not match version $pkg" >&2; exit 1; }
fi
