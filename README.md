# Sequence (multiplayer, 4 players / 2 random teams)

A LAN-playable version of the Sequence board game. One machine runs the server;
everyone else joins from a browser. The server is the referee: it holds the
deck, keeps each hand secret, and validates every move.

## Rules implemented
- 10x10 standard board, 4 shared free corners.
- Two full decks (104 cards). Each non-Jack card appears twice on the board.
- **Two-eyed Jacks (JD, JC) = wild** — place a chip on any open space.
- **One-eyed Jacks (JH, JS) = remove** an opponent's chip (not one in a completed sequence).
- **Dead card** swap: if both board spaces for a card you hold are taken, click it to swap (dimmed in your hand).
- A **sequence** = 5 in a row (horizontal, vertical, or diagonal); corners count for everyone.
- 4 players = 2 teams; **first team to 2 sequences wins**. Teams are assigned randomly at start.

## Requirements
- Node.js (tested on v24).

## Run
```bash
npm install
npm start
```
On startup it prints a Local and one or more Network URLs, e.g.:
```
Local:   http://localhost:3000
Network: http://10.34.124.87:3000
```

## Play
1. The host opens the Local URL, enters a name, clicks **Create room**. A 4-letter code appears.
2. Three other players open a **Network URL** (same code works) and **Join** with that code.
3. When 4 players are in, anyone clicks **Start game**. Teams are randomized.
4. On your turn: click a card in your hand, then click a highlighted board space.
   - Dimmed cards are dead — click to swap.
   - Wild Jack: any open space. One-eyed Jack: click an opponent chip to remove.

## Sharing on a company network
Players must be on the **same network** and reach your machine's IP.

- The server binds to `0.0.0.0`, so it listens on all interfaces.
- Pick the Network URL that matches your real LAN (ignore virtual adapters like
  Hyper-V/WSL ranges such as `172.x`). The `10.x`/`192.168.x` one is usually right.

### Windows Firewall
The first run may prompt to allow Node.js — allow it on **Private** networks.
If you weren't prompted, open an **admin** PowerShell and run:
```powershell
New-NetFirewallRule -DisplayName "Sequence 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### If coworkers still can't connect
Some corporate Wi-Fi uses **client isolation** (devices can't talk to each
other). Workarounds:
- Use a **wired** connection / same subnet, or
- Expose a temporary public URL with a tunnel, e.g. `ngrok http 3000` or
  `cloudflared tunnel --url http://localhost:3000`, and share that URL.

## Deploy to Render (free, public URL)

Hosting on Render gives you a public HTTPS URL anyone can reach — no LAN,
firewall, or client-isolation issues. This repo includes a `render.yaml`
blueprint, so setup is a few clicks. The server already reads `process.env.PORT`
and exposes a `/health` endpoint, which is all Render needs.

### Option A — Blueprint (uses render.yaml, recommended)
1. Push this repo to GitHub (already done).
2. Go to <https://dashboard.render.com> and sign in with GitHub.
3. Click **New +** → **Blueprint**.
4. Select your `sequence-multiplay` repository and approve access if prompted.
5. Render reads `render.yaml` and proposes a free **web service**. Click
   **Apply** / **Create**.
6. Wait for the first build (`npm install`) and deploy to finish. You'll get a
   URL like `https://sequence-multiplay.onrender.com`.
7. Open that URL, create a room, and share the same URL + room code with players.

### Option B — Manual (no blueprint)
1. Dashboard → **New +** → **Web Service** → connect the GitHub repo.
2. Settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
   - **Health Check Path**: `/health`
3. Click **Create Web Service** and wait for the deploy.

### Good to know about the free tier
- **Cold starts**: the free instance **sleeps after ~15 min of inactivity** and
  takes ~30–60s to wake on the next visit. Fine for casual game nights; the
  first player just waits a bit for it to spin up.
- **Auto-deploy**: with `autoDeploy: true`, every push to your default branch
  triggers a redeploy automatically.
- **In-memory state**: rooms/games live in memory, so a redeploy or sleep
  **ends any game in progress**. Keep the free tier to a single instance (the
  blueprint does this); don't scale to multiple instances or rooms won't be
  shared across them.
- **No secrets needed**: there are no API keys or env vars to configure. Your
  local corporate npm proxy does **not** affect Render — it builds in its own
  clean environment.

### Updating the deployed game
```bash
git add .
git commit -m "your change"
git push        # Render auto-deploys the new version
```

## Change the port
```bash
# PowerShell
$env:PORT=4000; npm start
```
Render sets `PORT` for you automatically — no action needed there.

## Project layout
```
server/
  index.js         HTTP + Socket.IO, room/lobby management
  game.js          deck, dealing, move validation, sequence detection
  board-layout.js  fixed 10x10 board
public/
  index.html       lobby + game screens
  style.css        board grid, chips, cards
  client.js        rendering + mouse interaction
```
```
```
