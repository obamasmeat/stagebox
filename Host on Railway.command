#!/bin/bash
export PATH="$HOME/.local/node/bin:$PATH"
cd "$HOME/Desktop/hello" || exit 1
echo "A pairing code will appear. Open the Railway link in Chrome and paste it."
echo
npx -y @railway/cli login --browserless
echo
echo "Logged in. Uploading Stagebox…"
npx -y @railway/cli up -y --name stagebox
echo
echo "Asking Railway for a public URL…"
npx -y @railway/cli domain
echo
echo "Done. Use the https link above on phones. Press Return to close."
read -r
