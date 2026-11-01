# Roadmap

Direction, not a promise: priorities change with feedback. Vote with a 👍 on the matching issue or open one.

## Now: first public release (0.1)

- Keychain-backed vault, folder tree, tabs, broadcast, snippets, session-only aliases, ⌘K palette.
- Signed releases with checksums, SBOM and build provenance.

## Next

- **Security**: keep decrypted secrets out of the WebView (resolve credentials in the backend); optional master password
  and lock screen.
- **Reliability**: one-click reconnect for dropped sessions.
- **Import**: `~/.ssh/config` import; jump hosts (`ProxyJump`).

## Later

- SFTP browser, port forwarding, split panes.
- Notarized builds once an Apple Developer ID is available.

## Not planned

- Accounts, cloud sync or telemetry. Soliton Term is local-first by design; export/import covers sharing.
