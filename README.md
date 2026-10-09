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

## Change the port
```bash
# PowerShell
$env:PORT=4000; npm start
```

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
