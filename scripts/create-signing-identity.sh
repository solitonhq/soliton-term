#!/usr/bin/env bash
# One-time: create the stable self-signed code-signing identity used by
# scripts/package-macos.sh. Writes only to ~/.config/soliton-signing (mode 0700);
# nothing is added to your Keychain or trust settings. See docs/SIGNING.md.
set -euo pipefail
DIR="${SOLITON_SIGNING_DIR:-$HOME/.config/soliton-signing}"
NAME="Soliton Term Signing"

if [ -f "$DIR/signing.p12" ]; then
  echo "Identity already exists at $DIR/signing.p12 — not overwriting." >&2
  exit 0
fi

umask 077
mkdir -p "$DIR"
cd "$DIR"

cat > openssl.cnf <<CNF
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=$NAME
O=SolitonHQ
[ext]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
subjectKeyIdentifier=hash
CNF

openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 7300 -config openssl.cnf
openssl rand -hex 16 > pass
openssl pkcs12 -export -inkey key.pem -in cert.pem -out signing.p12 -name "$NAME" -passout "pass:$(cat pass)"

echo
echo "Created $DIR/signing.p12"
echo "BACK THIS DIRECTORY UP (password manager / encrypted storage). Losing it changes the"
echo "app's identity and makes macOS re-ask for Keychain access once."
echo
echo "GitHub secrets for the release workflow:"
echo "  SOLITON_SIGNING_P12          base64 -i \"$DIR/signing.p12\" | pbcopy"
echo "  SOLITON_SIGNING_P12_PASSWORD cat \"$DIR/pass\" | pbcopy"
