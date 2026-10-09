import express from "express";
import http from "http";
import { Server } from "socket.io";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { SequenceGame, ALLOWED_PLAYER_COUNTS } from "./game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DEFAULT_PLAYERS = 2;

const app = express();
app.get("/health", (_req, res) => res.status(200).send("ok"));
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
const io = new Server(server);

// roomCode -> { players: [{id, name, socketId}], game, started }
const rooms = new Map();

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function lobbyState(room) {
  return {
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    required: room.maxPlayers,
    started: room.started,
  };
}

function broadcastLobby(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit("lobby", lobbyState(room));
}

// List of rooms anyone can join: not started and not full.
function publicRooms() {
  const list = [];
  for (const [code, room] of rooms) {
    if (room.started) continue;
    if (room.players.length >= room.maxPlayers) continue;
    list.push({
      code,
      host: room.players[0]?.name || "Player",
      count: room.players.length,
      required: room.maxPlayers,
    });
  }
  return list;
}

// Push the open-room list to every connected client (so the main menu updates live).
function broadcastRooms() {
  io.emit("openRooms", publicRooms());
}

// Build the win/lose chart snapshot sent to clients.
function historyState(room) {
  const members = Object.values(room.memberStats).sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses
  );
  return {
    matches: room.history,
    members,
    lastResult: room.lastResult,
    mustShuffle: room.consecutiveWins >= 2, // same team won twice in a row
    consecutiveWins: room.consecutiveWins,
  };
}

function broadcastHistory(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit("history", historyState(room));
}

// Start (or restart) a game in a room. If the same team composition has won
// twice in a row, force a reshuffle into a DIFFERENT composition (Jason2 Rule).
function startGame(room) {
  const ids = room.players.map((p) => p.id);
  let opts = {};

  if (room.consecutiveWins >= 2 && room.lastWinnerSignature) {
    // Keep reshuffling until the composition differs from the winning one.
    let attempt;
    for (let i = 0; i < 50; i++) {
      attempt = new SequenceGame(ids);
      if (attempt.teamSignature() !== room.lastWinnerSignature) break;
    }
    room.game = attempt;
    // Reset the streak since teams are now forcibly changed.
    room.consecutiveWins = 0;
  } else {
    room.game = new SequenceGame(ids, opts);
  }
  room.game.names = Object.fromEntries(room.players.map((p) => [p.id, p.name]));
  room.started = true;
  room.lastResult = null;
}

// Record a finished match into the room's history and member stats.
function recordResult(room) {
  const g = room.game;
  if (g.winner === null) return;

  const names = g.names || {};
  const teamsNames = {};
  for (const s of g.seats) {
    (teamsNames[s.team] ||= []).push(names[s.id] || "Player");
  }

  // Per-member win/loss
  for (const s of g.seats) {
    const stat = (room.memberStats[s.id] ||= {
      id: s.id,
      name: names[s.id] || "Player",
      wins: 0,
      losses: 0,
    });
    stat.name = names[s.id] || stat.name;
    if (s.team === g.winner) stat.wins++;
    else stat.losses++;
  }

  // Consecutive-win streak by exact team composition
  const sig = g.teamSignature();
  if (sig === room.lastWinnerSignature) room.consecutiveWins++;
  else room.consecutiveWins = 1;
  room.lastWinnerSignature = sig;

  const result = {
    match: room.history.length + 1,
    winnerTeam: g.winner,
    teams: teamsNames,
  };
  room.history.push(result);
  room.lastResult = result;
}

function broadcastGame(code) {
  const room = rooms.get(code);
  if (!room || !room.game) return;
  for (const p of room.players) {
    io.to(p.socketId).emit("game", room.game.stateFor(p.id));
  }
}

io.on("connection", (socket) => {
  let joinedCode = null;
  let playerId = socket.id;

  // Send the current open-room list to this client right away.
  socket.emit("openRooms", publicRooms());

  // Allow a client sitting on the menu to request a fresh list on demand.
  socket.on("listRooms", (_data, cb) => {
    cb?.({ ok: true, rooms: publicRooms() });
  });

  socket.on("create", ({ name, maxPlayers }, cb) => {
    const max = ALLOWED_PLAYER_COUNTS.includes(Number(maxPlayers))
      ? Number(maxPlayers)
      : DEFAULT_PLAYERS;
    const code = makeRoomCode();
    rooms.set(code, {
      players: [{ id: playerId, name: name || "Player", socketId: socket.id }],
      maxPlayers: max,
      game: null,
      started: false,
      // Match history for the win/lose chart and the rematch-shuffle rule.
      history: [],                 // [{ match, winnerTeam, teams: {0:[names],1:[names]} }]
      memberStats: {},             // playerId -> { name, wins, losses }
      lastWinnerSignature: null,   // team signature that won the previous match
      consecutiveWins: 0,          // times that exact composition won in a row
      lastResult: null,            // transient: result of the just-finished match
    });
    socket.join(code);
    joinedCode = code;
    cb?.({ ok: true, code, playerId });
    broadcastLobby(code);
    broadcastRooms();
  });

  socket.on("join", ({ code, name }, cb) => {
    code = (code || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found" });
    if (room.started) return cb?.({ ok: false, error: "Game already started" });
    if (room.players.length >= room.maxPlayers)
      return cb?.({ ok: false, error: "Room is full" });
    room.players.push({ id: playerId, name: name || "Player", socketId: socket.id });
    socket.join(code);
    joinedCode = code;
    cb?.({ ok: true, code, playerId });
    broadcastLobby(code);
    broadcastRooms();
  });

  socket.on("start", (_data, cb) => {
    const room = rooms.get(joinedCode);
    if (!room) return cb?.({ ok: false, error: "Not in a room" });
    if (room.players.length !== room.maxPlayers)
      return cb?.({ ok: false, error: `Need exactly ${room.maxPlayers} players` });
    startGame(room);
    cb?.({ ok: true });
    broadcastLobby(joinedCode);
    broadcastGame(joinedCode);
    broadcastHistory(joinedCode);
    broadcastRooms(); // started room disappears from the open list
  });

  // Play another match with the same players (teams reshuffle; forced different
  // composition if the same team just won twice in a row).
  socket.on("rematch", (_data, cb) => {
    const room = rooms.get(joinedCode);
    if (!room) return cb?.({ ok: false, error: "Not in a room" });
    if (room.players.length !== room.maxPlayers)
      return cb?.({ ok: false, error: `Need ${room.maxPlayers} players for a rematch` });
    startGame(room);
    cb?.({ ok: true });
    broadcastGame(joinedCode);
    broadcastHistory(joinedCode);
  });

  socket.on("move", (action, cb) => {
    const room = rooms.get(joinedCode);
    if (!room || !room.game) return cb?.({ ok: false, error: "No game" });
    const wasOver = room.game.winner !== null;
    const result = room.game.play(playerId, action);
    if (!result.ok) return cb?.(result);
    cb?.({ ok: true });
    // If this move just ended the game, log the result once.
    if (!wasOver && room.game.winner !== null) {
      recordResult(room);
      broadcastHistory(joinedCode);
    }
    broadcastGame(joinedCode);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(joinedCode);
    if (!room) return;
    if (!room.started) {
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.players.length === 0) rooms.delete(joinedCode);
      else broadcastLobby(joinedCode);
      broadcastRooms(); // room freed up a slot or was removed
    }
    // If started, we keep the seat so the player can be re-added later (v2).
  });
});

function printAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) addrs.push(net.address);
    }
  }
  console.log("\n  Sequence server running!");
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const a of addrs) console.log(`  Network: http://${a}:${PORT}`);
  console.log("\n  Share a Network URL with players on the same LAN.\n");
}

server.listen(PORT, "0.0.0.0", printAddresses);
