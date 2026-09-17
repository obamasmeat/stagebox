#!/bin/bash
# Double-click this. It opens two Terminal windows.
# Window 1 = Stagebox    Window 2 = public phone URL

ROOT="$HOME/Desktop/hello"
NODE="$HOME/.local/node/bin"
TOOLS="$ROOT/.tools"

osascript <<EOF
tell application "Terminal"
  activate
  do script "export PATH=\"$NODE:\$PATH\"; cd \"$ROOT\"; npm run dev"
  delay 0.4
  do script "mkdir -p \"$TOOLS\"; cd \"$TOOLS\"; if [ ! -x ./cloudflared ]; then echo 'Downloading cloudflared…'; curl -fsSL -o cloudflared.tgz \"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz\"; tar -xzf cloudflared.tgz; chmod +x cloudflared; fi; echo 'Waiting for Stagebox on 5173…'; until curl -sf -o /dev/null http://127.0.0.1:5173; do sleep 1; done; echo 'Starting public URL — copy the https://….trycloudflare.com line below'; ./cloudflared tunnel --url http://127.0.0.1:5173"
end tell
EOF
