import express from "express";
import http from "http";
import { Server } from "socket.io";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { SequenceGame } from "./game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const REQUIRED_PLAYERS = 4;

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
    required: REQUIRED_PLAYERS,
    started: room.started,
  };
}

function broadcastLobby(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit("lobby", lobbyState(room));
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

  socket.on("create", ({ name }, cb) => {
    const code = makeRoomCode();
    rooms.set(code, {
      players: [{ id: playerId, name: name || "Player", socketId: socket.id }],
      game: null,
      started: false,
    });
    socket.join(code);
    joinedCode = code;
    cb?.({ ok: true, code, playerId });
    broadcastLobby(code);
  });

  socket.on("join", ({ code, name }, cb) => {
    code = (code || "").toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: "Room not found" });
    if (room.started) return cb?.({ ok: false, error: "Game already started" });
    if (room.players.length >= REQUIRED_PLAYERS)
      return cb?.({ ok: false, error: "Room is full" });
    room.players.push({ id: playerId, name: name || "Player", socketId: socket.id });
    socket.join(code);
    joinedCode = code;
    cb?.({ ok: true, code, playerId });
    broadcastLobby(code);
  });

  socket.on("start", (_data, cb) => {
    const room = rooms.get(joinedCode);
    if (!room) return cb?.({ ok: false, error: "Not in a room" });
    if (room.players.length !== REQUIRED_PLAYERS)
      return cb?.({ ok: false, error: `Need exactly ${REQUIRED_PLAYERS} players` });
    room.game = new SequenceGame(room.players.map((p) => p.id));
    room.started = true;
    cb?.({ ok: true });
    broadcastLobby(joinedCode);
    broadcastGame(joinedCode);
  });

  socket.on("move", (action, cb) => {
    const room = rooms.get(joinedCode);
    if (!room || !room.game) return cb?.({ ok: false, error: "No game" });
    const result = room.game.play(playerId, action);
    if (!result.ok) return cb?.(result);
    cb?.({ ok: true });
    broadcastGame(joinedCode);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(joinedCode);
    if (!room) return;
    if (!room.started) {
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.players.length === 0) rooms.delete(joinedCode);
      else broadcastLobby(joinedCode);
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
