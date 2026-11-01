# Demo servers and screenshots

The screenshots in the README are the **real app** connected to a **local, scripted SSH server**. No real hosts,
credentials or data are shown.

- `demo_server.py` listens on `127.0.0.1:2201-2205` only, accepts one throw-away key, and answers a few well-known
  commands (`uptime`, `free -h`, `df -hT`, `kubectl get pods`, …) with canned text. It never executes anything.
- `make_bundle.py` prints a workspace bundle that points at those servers.

## Reproduce

```bash
python3 -m venv /tmp/demo-venv && /tmp/demo-venv/bin/pip install asyncssh==2.21.1
/tmp/demo-venv/bin/python scripts/demo/demo_server.py --dir /tmp/soliton-demo &
python3 scripts/demo/make_bundle.py --dir /tmp/soliton-demo | pbcopy     # then: Import workspace → paste
```

Use a **separate vault** so your own data is untouched. The app resolves its data directory from `$HOME` and finds the
Keychain through `~/Library/Keychains`, so a throw-away home with the Keychains folder linked in works:

```bash
H=/tmp/soliton-demo-home; mkdir -p "$H/Library/Preferences"
ln -sfn "$HOME/Library/Keychains" "$H/Library/Keychains"
cp "$HOME/Library/Preferences/com.apple.security.plist" "$H/Library/Preferences/"
HOME="$H" "/Applications/Soliton Term.app/Contents/MacOS/soliton-term" \
  -NSAutomaticSpellingCorrectionEnabled NO -NSAutomaticCapitalizationEnabled NO \
  -WebAutomaticSpellingCorrectionEnabled NO -WebContinuousSpellCheckingEnabled NO
```

The `-NS…`/`-Web…` arguments turn off macOS autocorrect for that process only (it otherwise capitalises `payments` in
text fields). OpenSSH records the demo host keys in your real `~/.ssh/known_hosts`; remove them afterwards with
`ssh-keygen -R "[127.0.0.1]:2201"` (and 2202-2205).

Window images were captured with `screencapture -R` on the window's rectangle and given transparent rounded corners.
