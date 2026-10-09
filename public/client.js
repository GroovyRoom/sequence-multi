const socket = io();

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const lobbyEl = $("lobby");
const gameEl = $("game");
const nameInput = $("name");
const createBtn = $("createBtn");
const joinBtn = $("joinBtn");
const joinCode = $("joinCode");
const lobbyError = $("lobbyError");
const roomPanel = $("roomPanel");
const roomCodeEl = $("roomCode");
const playerList = $("playerList");
const startBtn = $("startBtn");

const statusEl = $("status");
const scoresEl = $("scores");
const boardEl = $("board");
const handEl = $("hand");
const handLabel = $("handLabel");
const moveHint = $("moveHint");
const banner = $("banner");

let myId = null;
let myRoom = null;
let selectedCard = null; // card string currently selected from hand
let latest = null; // latest game state

// ---- Lobby ----
createBtn.onclick = () => {
  socket.emit("create", { name: nameInput.value.trim() }, (res) => {
    if (!res.ok) return (lobbyError.textContent = res.error || "Error");
    myId = res.playerId;
    myRoom = res.code;
    showRoom();
  });
};

joinBtn.onclick = () => {
  const code = joinCode.value.trim().toUpperCase();
  if (!code) return (lobbyError.textContent = "Enter a room code");
  socket.emit("join", { code, name: nameInput.value.trim() }, (res) => {
    if (!res.ok) return (lobbyError.textContent = res.error || "Error");
    myId = res.playerId;
    myRoom = res.code;
    showRoom();
  });
};

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

function teamName(t) { return t === 0 ? "Blue" : "Green"; }

function render() {
  const s = latest;
  const myTurn = s.currentPlayerId === s.yourId;

  // status + scores
  const turnPlayer = s.seats.find((x) => x.id === s.currentPlayerId);
  statusEl.textContent = myTurn
    ? "Your turn"
    : `Waiting for ${teamName(turnPlayer?.team)} (seat ${turnPlayer?.seat + 1})`;
  statusEl.style.color = myTurn ? "var(--gold)" : "var(--text)";

  scoresEl.innerHTML = "";
  for (const t of [0, 1]) {
    const d = document.createElement("div");
    d.className = `score-chip t${t}`;
    d.textContent = `${teamName(t)}: ${s.sequenceCount[t]}/${s.sequencesToWin}`;
    scoresEl.appendChild(d);
  }

  handLabel.textContent = `Your team: ${teamName(s.yourTeam)} — click a card, then a highlighted space`;

  renderBoard(s, myTurn);
  renderHand(s, myTurn);
  updateHint(s, myTurn);

  if (s.winner !== null) {
    banner.classList.remove("hidden");
    const won = s.winner === s.yourTeam;
    banner.textContent = `${teamName(s.winner)} wins! ${won ? "🎉 You won!" : ""}`;
    banner.style.color = s.winner === 0 ? "var(--team0)" : "var(--team1)";
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
