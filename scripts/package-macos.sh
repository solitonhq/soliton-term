#!/usr/bin/env bash
# Build, sign and package Soliton Term for macOS.
#
# Signs with a *stable* identity so the Keychain item that protects the vault key
# keeps working across updates (an ad-hoc signature changes with every build, which
# makes macOS re-prompt after each update). See docs/SIGNING.md.
#
# Usage: scripts/package-macos.sh [rust-target-triple] [--build-only | --sign-only]
#
#   (default)     build, sign and package in one go (local use)
#   --build-only  build the .app only; needs no secrets
#   --sign-only   sign the existing .app and write the DMG; the only phase that touches the key
#
# CI runs the two phases as separate steps so the signing key is never present in the environment of the
# build, where dependency build scripts (cargo build.rs, npm scripts) run.
#
# Env:   SOLITON_SIGNING_P12            path to the .p12   (default: ~/.config/soliton-signing/signing.p12)
#        SOLITON_SIGNING_P12_PASSWORD   its password       (or a file at ~/.config/soliton-signing/pass)
#        RCODESIGN                      rcodesign binary   (default: rcodesign)
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=""; MODE=all
for arg in "$@"; do
  case "$arg" in
    --build-only) MODE=build ;;
    --sign-only)  MODE=sign ;;
    -*) echo "unknown option $arg" >&2; exit 1 ;;
    *)  TARGET="$arg" ;;
  esac
done

OUT="src-tauri/target/${TARGET:+$TARGET/}release/bundle"
APP="$OUT/macos/Soliton Term.app"

build() {
  echo "==> Building app bundle"
  npm run tauri build -- --bundles app ${TARGET:+--target "$TARGET"}
  [ -d "$APP" ] || { echo "error: $APP not found" >&2; exit 1; }
}

sign_and_package() {
  local RCODESIGN="${RCODESIGN:-rcodesign}"
  local P12="${SOLITON_SIGNING_P12:-$HOME/.config/soliton-signing/signing.p12}"
  local PASS_FILE="$HOME/.config/soliton-signing/pass"

  [ -d "$APP" ] || { echo "error: $APP not found (run --build-only first)" >&2; exit 1; }
  [ -f "$P12" ] || { echo "error: signing identity not found at $P12 (see docs/SIGNING.md)" >&2; exit 1; }
  command -v "$RCODESIGN" >/dev/null || { echo "error: rcodesign not found (cargo install apple-codesign --locked --version 0.29.0)" >&2; exit 1; }

  PASS_TMP=""
  if [ -n "${SOLITON_SIGNING_P12_PASSWORD:-}" ]; then
    PASS_TMP="$(mktemp)"; chmod 600 "$PASS_TMP"; printf '%s' "$SOLITON_SIGNING_P12_PASSWORD" > "$PASS_TMP"
    PASS_FILE="$PASS_TMP"
  fi
  trap '[ -n "$PASS_TMP" ] && rm -f "$PASS_TMP"; [ -n "${STAGE:-}" ] && rm -rf "$STAGE"; true' EXIT
  [ -f "$PASS_FILE" ] || { echo "error: no signing password (set SOLITON_SIGNING_P12_PASSWORD)" >&2; exit 1; }

  echo "==> Signing"
  "$RCODESIGN" sign --p12-file "$P12" --p12-password-file "$PASS_FILE" "$APP"
  codesign --verify --deep --strict "$APP"
  codesign -d -r- "$APP" 2>&1 | grep designated

  local VERSION ARCH
  VERSION="$(python3 -c 'import json;print(json.load(open("src-tauri/tauri.conf.json"))["version"])')"
  case "${TARGET:-$(uname -m)}" in
    aarch64*|arm64) ARCH=aarch64 ;;
    x86_64*)        ARCH=x64 ;;
    *)              ARCH="${TARGET:-$(uname -m)}" ;;
  esac

  echo "==> Packaging DMG"
  STAGE="$(mktemp -d)"
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  mkdir -p "$OUT/dmg"
  local DMG="$OUT/dmg/SolitonTerm_${VERSION}_${ARCH}.dmg"
  rm -f "$DMG"
  hdiutil create -volname "Soliton Term" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
  echo "==> Done: $DMG"
}

[ "$MODE" = sign ]  || build
[ "$MODE" = build ] || sign_and_package
