const socket = io();

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const lobbyEl = $("lobby");
const gameEl = $("game");
const nameInput = $("name");
const maxPlayersSel = $("maxPlayers");
const createBtn = $("createBtn");
const joinBtn = $("joinBtn");
const joinCode = $("joinCode");
const lobbyError = $("lobbyError");
const roomPanel = $("roomPanel");
const roomCodeEl = $("roomCode");
const playerList = $("playerList");
const startBtn = $("startBtn");
const roomsList = $("roomsList");
const noRooms = $("noRooms");
const refreshRooms = $("refreshRooms");

const statusEl = $("status");
const scoresEl = $("scores");
const boardEl = $("board");
const handEl = $("hand");
const handLabel = $("handLabel");
const moveHint = $("moveHint");
const banner = $("banner");
const bannerText = $("bannerText");
const bannerNote = $("bannerNote");
const rematchBtn = $("rematchBtn");
const playersStrip = $("players");
const deckCount = $("deckCount");
const chartBody = $("chartBody");

let myId = null;
let myRoom = null;
let selectedCard = null; // card string currently selected from hand
let latest = null; // latest game state

// ---- Lobby ----
createBtn.onclick = () => {
  const maxPlayers = Number(maxPlayersSel.value);
  socket.emit("create", { name: nameInput.value.trim(), maxPlayers }, (res) => {
    if (!res.ok) return (lobbyError.textContent = res.error || "Error");
    myId = res.playerId;
    myRoom = res.code;
    showRoom();
  });
};

// Shared join logic used by both the code input and the clickable room list.
function joinRoom(code) {
  code = (code || "").trim().toUpperCase();
  if (!code) return (lobbyError.textContent = "Enter a room code");
  socket.emit("join", { code, name: nameInput.value.trim() }, (res) => {
    if (!res.ok) return (lobbyError.textContent = res.error || "Error");
    myId = res.playerId;
    myRoom = res.code;
    showRoom();
  });
}

joinBtn.onclick = () => joinRoom(joinCode.value);

refreshRooms.onclick = () => {
  socket.emit("listRooms", {}, (res) => {
    if (res?.ok) renderRooms(res.rooms);
  });
};

// Live list of open games on the main menu.
socket.on("openRooms", renderRooms);

function renderRooms(rooms) {
  roomsList.innerHTML = "";
  if (!rooms || rooms.length === 0) {
    noRooms.classList.remove("hidden");
    return;
  }
  noRooms.classList.add("hidden");
  for (const r of rooms) {
    const li = document.createElement("li");
    li.className = "room-item";
    const full = r.count >= r.required;
    li.innerHTML = `
      <div class="room-info">
        <span class="room-host">${escapeHtml(r.host)}'s game</span>
        <span class="room-meta">code ${r.code} &middot; ${r.count}/${r.required} players</span>
      </div>
      <button class="join-room" type="button" ${full ? "disabled" : ""}>${full ? "Full" : "Join"}</button>`;
    li.querySelector(".join-room").onclick = () => joinRoom(r.code);
    roomsList.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

startBtn.onclick = () => {
  socket.emit("start", {}, (res) => {
    if (!res.ok) lobbyError.textContent = res.error || "Error";
  });
};

function showRoom() {
  lobbyError.textContent = "";
  roomPanel.classList.remove("hidden");
  roomCodeEl.textContent = myRoom;
}

socket.on("lobby", (state) => {
  playerList.innerHTML = "";
  state.players.forEach((p, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${p.name}${p.id === myId ? " (you)" : ""}`;
    playerList.appendChild(li);
  });
  const ready = state.players.length === state.required;
  startBtn.disabled = !ready;
  startBtn.textContent = ready
    ? "Start game"
    : `Start game (need ${state.required}, have ${state.players.length})`;
});

// ---- Game ----
socket.on("game", (state) => {
  latest = state;
  lobbyEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  render();
});

// ---- Win/lose chart (Jason2 Rule) ----
let latestHistory = null;
socket.on("history", (h) => {
  latestHistory = h;
  renderChart(h);
  renderBannerNote(h);
});

rematchBtn.onclick = () => {
  rematchBtn.disabled = true;
  socket.emit("rematch", {}, (res) => {
    rematchBtn.disabled = false;
    if (!res.ok && res.error) bannerNote.textContent = res.error;
  });
};

function renderChart(h) {
  if (!chartBody) return;
  if (!h || (h.members.length === 0 && h.matches.length === 0)) {
    chartBody.innerHTML = `<p class="hint">No matches played yet.</p>`;
    return;
  }
  // Per-member win/loss table
  const rows = h.members
    .map(
      (m) => `<tr>
        <td>${escapeHtml(m.name)}</td>
        <td class="w">${m.wins}</td>
        <td class="l">${m.losses}</td>
      </tr>`
    )
    .join("");

  // Match log
  const log = h.matches
    .slice()
    .reverse()
    .map((mt) => {
      const t0 = (mt.teams[0] || []).map(escapeHtml).join(", ");
      const t1 = (mt.teams[1] || []).map(escapeHtml).join(", ");
      const winTeam = teamName(mt.winnerTeam);
      return `<li>#${mt.match}: <strong>${winTeam}</strong> won &middot;
        <span class="t0">${t0}</span> vs <span class="t1">${t1}</span></li>`;
    })
    .join("");

  chartBody.innerHTML = `
    <table class="stats">
      <thead><tr><th>Player</th><th>W</th><th>L</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <ul class="matchlog">${log || ""}</ul>`;
}

function renderBannerNote(h) {
  if (!bannerNote) return;
  if (h && h.mustShuffle) {
    bannerNote.textContent =
      "Same team won twice in a row — teams will be reshuffled next match.";
    bannerNote.classList.add("warn");
  } else {
    bannerNote.textContent = "";
    bannerNote.classList.remove("warn");
  }
}

const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RED_SUITS = new Set(["H", "D"]);

function cardParts(code) {
  // code like "TS", "AH", "JD"
  const rank = code.slice(0, -1);
  const suit = code.slice(-1);
  const display = rank === "T" ? "10" : rank;
  return { rank: display, suit, sym: SUIT_SYMBOL[suit], red: RED_SUITS.has(suit) };
}

function isTwoEyed(code) { return code === "JD" || code === "JC"; }
function isOneEyed(code) { return code === "JH" || code === "JS"; }
function isJack(code) { return code.startsWith("J"); }

const TEAM_NAMES = ["Blue", "Green"];
function teamName(t) { return TEAM_NAMES[t] ?? `Team ${t + 1}`; }

function nameOf(s, id) {
  return (s.names && s.names[id]) || "Player";
}

function render() {
  const s = latest;
  const myTurn = s.currentPlayerId === s.yourId;

  // status
  const turnPlayer = s.seats.find((x) => x.id === s.currentPlayerId);
  statusEl.textContent = myTurn
    ? "Your turn"
    : `${nameOf(s, s.currentPlayerId)}'s turn (${teamName(turnPlayer?.team)})`;
  statusEl.style.color = myTurn ? "var(--gold)" : "var(--text)";

  // scores (always 2 teams under Jason2 Rule)
  scoresEl.innerHTML = "";
  for (let t = 0; t < (s.numTeams || 2); t++) {
    const d = document.createElement("div");
    d.className = `score-chip t${t}`;
    d.textContent = `${teamName(t)}: ${s.sequenceCount[t] ?? 0}/${s.sequencesToWin}`;
    scoresEl.appendChild(d);
  }

  handLabel.textContent = `Your team: ${teamName(s.yourTeam)} — click a card, then a highlighted space`;

  renderPlayers(s);
  renderBoard(s, myTurn);
  renderHand(s, myTurn);
  updateHint(s, myTurn);

  // deck count
  if (deckCount) deckCount.textContent = s.deckRemaining ?? 0;

  // win banner
  if (s.winner !== null) {
    banner.classList.remove("hidden");
    const won = s.winner === s.yourTeam;
    bannerText.textContent = `${teamName(s.winner)} wins!${won ? " 🎉 You won!" : ""}`;
    bannerText.style.color = s.winner === 0 ? "var(--team0)" : "var(--team1)";
  } else {
    banner.classList.add("hidden");
  }
}

// Turn-order strip: shows every player, their team color, and highlights whose turn it is.
function renderPlayers(s) {
  if (!playersStrip) return;
  playersStrip.innerHTML = "";
  const ordered = [...s.seats].sort((a, b) => a.seat - b.seat);
  for (const seat of ordered) {
    const el = document.createElement("div");
    el.className = `pstrip t${seat.team}`;
    if (seat.id === s.currentPlayerId) el.classList.add("current");
    if (seat.id === s.yourId) el.classList.add("me");
    const cards = s.handCounts?.[seat.id];
    el.innerHTML = `
      <span class="pstrip-dot"></span>
      <span class="pstrip-name">${escapeHtml(nameOf(s, seat.id))}${seat.id === s.yourId ? " (you)" : ""}</span>
      <span class="pstrip-cards">${cards ?? "?"}🂠</span>`;
    playersStrip.appendChild(el);
  }
}

function lockedSet(s) {
  const set = new Set();
  for (const seq of s.sequencedCells)
    for (const [r, c] of seq.cells) set.add(r + "," + c);
  return set;
}

function renderBoard(s, myTurn) {
  boardEl.innerHTML = "";
  const canPlace = myTurn && selectedCard && !isOneEyed(selectedCard);
  const canRemove = myTurn && selectedCard && isOneEyed(selectedCard);
  const wild = selectedCard && isTwoEyed(selectedCard);
  const locked = lockedSet(s);

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const code = s.layout[r][c];
      const cell = document.createElement("div");
      cell.className = "cell";

      if (code === "FREE") {
        cell.classList.add("free");
      } else {
        const { rank, sym, red } = cardParts(code);
        cell.innerHTML = `<span class="rank">${rank}</span><span class="suit ${red ? "red" : "black"}">${sym}</span>`;
      }

      const chip = s.board[r][c];
      if (chip) {
        const chipEl = document.createElement("div");
        chipEl.className = `chip t${chip.team}`;
        cell.appendChild(chipEl);
        if (locked.has(r + "," + c)) cell.classList.add("locked");
      }

      // Highlight interactivity
      const open = code !== "FREE" && !chip;
      if (canPlace && open && (wild || code === selectedCard)) {
        cell.classList.add("playable");
        cell.onclick = () => sendMove({ type: "place", card: selectedCard, r, c });
      } else if (canRemove && chip && chip.team !== s.yourTeam && !locked.has(r + "," + c)) {
        cell.classList.add("removable");
        cell.onclick = () => sendMove({ type: "remove", card: selectedCard, r, c });
      }

      boardEl.appendChild(cell);
    }
  }
}

function renderHand(s, myTurn) {
  handEl.innerHTML = "";
  for (const code of s.yourHand) {
    const { rank, sym, red } = cardParts(code);
    const el = document.createElement("div");
    el.className = "playing-card";
    if (code === selectedCard) el.classList.add("selected");

    const dead = isDeadCard(s, code);
    if (dead) el.classList.add("dead");

    let tag = "";
    if (isTwoEyed(code)) tag = `<div class="jack-tag">WILD</div>`;
    else if (isOneEyed(code)) tag = `<div class="jack-tag">REMOVE</div>`;

    el.innerHTML = `
      <div class="corner-t suit ${red ? "red" : ""}">${rank}${sym}</div>
      ${tag}
      <div class="corner-b suit ${red ? "red" : ""}">${rank}${sym}</div>`;

    if (myTurn) {
      el.onclick = () => {
        if (dead) {
          // offer dead-card swap
          sendMove({ type: "swapDead", card: code });
          return;
        }
        selectedCard = selectedCard === code ? null : code;
        render();
      };
    }
    handEl.appendChild(el);
  }
}

function isDeadCard(s, code) {
  if (isJack(code)) return false;
  let positions = 0, occupied = 0;
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++)
      if (s.layout[r][c] === code) {
        positions++;
        if (s.board[r][c]) occupied++;
      }
  return positions > 0 && positions === occupied;
}

function updateHint(s, myTurn) {
  if (!myTurn) { moveHint.textContent = ""; return; }
  if (!selectedCard) {
    moveHint.textContent = "Select a card. (Dead cards are dimmed — click to swap.)";
    return;
  }
  if (isTwoEyed(selectedCard)) moveHint.textContent = "Wild Jack: click any open space.";
  else if (isOneEyed(selectedCard)) moveHint.textContent = "One-eyed Jack: click an opponent chip to remove.";
  else moveHint.textContent = "Click a highlighted space matching your card.";
}

function sendMove(action) {
  socket.emit("move", action, (res) => {
    if (!res.ok) {
      moveHint.textContent = res.error || "Invalid move";
      moveHint.style.color = "var(--red)";
      setTimeout(() => (moveHint.style.color = "var(--gold)"), 1500);
    } else {
      selectedCard = null;
    }
  });
}
