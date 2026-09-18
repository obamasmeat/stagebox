# Stagebox

Band rehearsal app. Everyone opens the same link, one person starts a room, everyone else joins with the 4-letter code. Tabs, drums, bass, vocals, and the playhead stay on the same bar.

**Play it:** https://stagebox-production.up.railway.app

## How to join

1. Open https://stagebox-production.up.railway.app on your phone or laptop
2. Type your name
3. Pick guitar, bass, drums, or vocals
4. One person hits **Start room**
5. Everyone else types the 4-letter code and hits **Join**

Same URL for everyone. Use https. No port.

## What it does

- Guitar / bass tab from Guitar Pro and MIDI
- Drum notation
- Lyrics that follow the playhead
- Click a bar to start from there
- Setlists save on the host

## Run locally (this Mac)

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd ~/Desktop/hello
npm install
npm run dev
Then open http://localhost:5173

