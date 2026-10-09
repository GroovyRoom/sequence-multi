import { BOARD_LAYOUT, BOARD_SIZE } from "./board-layout.js";

// ---- Card helpers ----
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "Q", "K"];
const SUITS = ["S", "H", "D", "C"];

// Jacks (not on board). Two-eyed = wild (place anywhere). One-eyed = remove opponent chip.
// Standard: one-eyed Jacks are JH and JS; two-eyed Jacks are JD and JC.
const ONE_EYED_JACKS = new Set(["JH", "JS"]);
const TWO_EYED_JACKS = new Set(["JD", "JC"]);

export function isOneEyedJack(card) {
  return ONE_EYED_JACKS.has(card);
}
export function isTwoEyedJack(card) {
  return TWO_EYED_JACKS.has(card);
}
export function isJack(card) {
  return card.startsWith("J");
}

// Build 2 standard decks = 104 cards (includes 8 Jacks).
function buildDeck() {
  const deck = [];
  for (let d = 0; d < 2; d++) {
    for (const s of SUITS) {
      for (const r of RANKS) deck.push(r + s);
      deck.push("J" + s); // one Jack per suit per deck
    }
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Jason2 Rule — always 2 teams. Keyed by player count:
// { teams, cards (per player), win (sequences needed) }
const MODES = {
  2: { teams: 2, cards: 5, win: 2 },
  4: { teams: 2, cards: 5, win: 3 },
  6: { teams: 2, cards: 4, win: 3 },
  8: { teams: 2, cards: 3, win: 3 },
};

export const ALLOWED_PLAYER_COUNTS = [2, 4, 6, 8];

export function modeFor(numPlayers) {
  return MODES[numPlayers] || MODES[2];
}

// Fisher-Yates on seat order to randomize team assignment, then alternate teams
// around the table so teammates are never adjacent (per the rules).
// seat % teams: 2 teams -> ABAB.
export function assignTeams(playerIds, teams = 2) {
  const seats = shuffle([...playerIds]);
  return seats.map((id, seat) => ({ id, seat, team: seat % teams }));
}

// Build seats from an explicit {playerId -> team} map (used by the rematch
// shuffle rule so we can force a different team composition). Players of the
// same team are still interleaved around the table.
export function seatsFromTeamMap(teamMap) {
  const byTeam = {};
  for (const [id, team] of Object.entries(teamMap)) {
    (byTeam[team] ||= []).push(id);
  }
  const teams = Object.keys(byTeam).map(Number).sort();
  const seats = [];
  let seat = 0;
  // Interleave: take one from each team in turn.
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const t of teams) {
      const id = byTeam[t].shift();
      if (id !== undefined) {
        seats.push({ id, seat: seat++, team: t });
        remaining = true;
      }
    }
  }
  return seats;
}

const DIRECTIONS = [
  [0, 1],  // horizontal
  [1, 0],  // vertical
  [1, 1],  // diagonal down-right
  [1, -1], // diagonal down-left
];

export class SequenceGame {
  // opts.teamMap: optional { playerId -> team } to force a specific composition
  //   (used to enforce the rematch team-shuffle rule).
  constructor(playerIds, opts = {}) {
    this.numPlayers = playerIds.length;
    const mode = modeFor(this.numPlayers);
    this.numTeams = mode.teams;
    this.sequencesToWin = mode.win;
    this.seats = opts.teamMap
      ? seatsFromTeamMap(opts.teamMap)
      : assignTeams(playerIds, this.numTeams); // [{id, seat, team}]

    // board[r][c] = { team } chip owner, or null. Free corners are shared/neutral.
    this.board = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => null)
    );
    // cells that are locked as part of a completed sequence
    this.locked = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => false)
    );

    this.deck = shuffle(buildDeck());
    this.discard = [];
    this.hands = {}; // playerId -> [cards]
    const per = mode.cards;
    for (const { id } of this.seats) {
      this.hands[id] = this.deck.splice(0, per);
    }

    this.turnOrder = this.seats.map((s) => s.id); // seat order = turn order (clockwise)
    this.currentSeat = 0;
    this.sequenceCount = {}; // per team
    for (let t = 0; t < this.numTeams; t++) this.sequenceCount[t] = 0;
    this.sequencedCells = []; // list of completed sequences (arrays of [r,c]) for UI
    this.winner = null; // team index or null
  }

  // Map of playerId -> team, and a canonical signature of the team composition
  // (unordered sets of members per team) for the rematch-shuffle rule.
  teamMap() {
    return Object.fromEntries(this.seats.map((s) => [s.id, s.team]));
  }
  teamSignature() {
    const byTeam = {};
    for (const s of this.seats) (byTeam[s.team] ||= []).push(s.id);
    return Object.values(byTeam)
      .map((members) => members.slice().sort().join("+"))
      .sort()
      .join("|");
  }

  teamOf(playerId) {
    const s = this.seats.find((x) => x.id === playerId);
    return s ? s.team : null;
  }

  currentPlayerId() {
    return this.turnOrder[this.currentSeat];
  }

  // All board positions matching a given card code.
  positionsForCard(card) {
    const out = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (BOARD_LAYOUT[r][c] === card) out.push([r, c]);
      }
    }
    return out;
  }

  isOpen(r, c) {
    return BOARD_LAYOUT[r][c] !== "FREE" && this.board[r][c] === null;
  }

  // A card is "dead" if both of its board spaces are already occupied.
  isDeadCard(card) {
    if (isJack(card)) return false;
    const pos = this.positionsForCard(card);
    return pos.every(([r, c]) => this.board[r][c] !== null);
  }

  drawOne(playerId) {
    if (this.deck.length === 0) {
      // reshuffle discards into a new draw deck
      if (this.discard.length === 0) return; // nothing to draw
      this.deck = shuffle(this.discard);
      this.discard = [];
    }
    const card = this.deck.shift();
    if (card) this.hands[playerId].push(card);
  }

  advanceTurn() {
    this.currentSeat = (this.currentSeat + 1) % this.numPlayers;
  }

  /**
   * Attempt a move. Returns { ok, error }.
   * action: { type: 'place'|'remove'|'swapDead', card, r, c }
   */
  play(playerId, action) {
    if (this.winner !== null) return { ok: false, error: "Game is over" };
    if (playerId !== this.currentPlayerId())
      return { ok: false, error: "Not your turn" };

    const hand = this.hands[playerId];
    const { card } = action;
    if (!hand.includes(card)) return { ok: false, error: "You don't hold that card" };

    const team = this.teamOf(playerId);

    if (action.type === "swapDead") {
      if (!this.isDeadCard(card))
        return { ok: false, error: "That card is not dead" };
      this._discardFromHand(playerId, card);
      this.drawOne(playerId);
      // swapping a dead card does NOT end the turn; player still plays
      return { ok: true, continueTurn: true };
    }

    if (action.type === "remove") {
      // one-eyed Jack: remove an opponent chip (not locked, not own)
      if (!isOneEyedJack(card))
        return { ok: false, error: "Only a one-eyed Jack can remove a chip" };
      const { r, c } = action;
      const chip = this.board[r]?.[c];
      if (!chip) return { ok: false, error: "No chip there" };
      if (this.locked[r][c])
        return { ok: false, error: "Cannot remove a chip in a completed sequence" };
      if (chip.team === team)
        return { ok: false, error: "Cannot remove your own chip" };
      this.board[r][c] = null;
      this._discardFromHand(playerId, card);
      this.drawOne(playerId);
      this.advanceTurn();
      return { ok: true };
    }

    if (action.type === "place") {
      const { r, c } = action;
      if (BOARD_LAYOUT[r]?.[c] === "FREE")
        return { ok: false, error: "Cannot place on a free corner" };
      if (this.board[r][c] !== null)
        return { ok: false, error: "That space is occupied" };

      if (isTwoEyedJack(card)) {
        // wild: any open space
      } else if (isOneEyedJack(card)) {
        return { ok: false, error: "One-eyed Jacks remove chips, not place" };
      } else {
        // normal card must match the board cell
        if (BOARD_LAYOUT[r][c] !== card)
          return { ok: false, error: "Card does not match that space" };
      }

      this.board[r][c] = { team };
      this._discardFromHand(playerId, card);
      this._checkSequences(team);
      this.drawOne(playerId);

      if (this.sequenceCount[team] >= this.sequencesToWin) {
        this.winner = team;
      }
      this.advanceTurn();
      return { ok: true };
    }

    return { ok: false, error: "Unknown action" };
  }

  _discardFromHand(playerId, card) {
    const hand = this.hands[playerId];
    const idx = hand.indexOf(card);
    if (idx >= 0) hand.splice(idx, 1);
    this.discard.push(card);
  }

  // Treat free corners as belonging to every team.
  _ownedBy(r, c, team) {
    if (BOARD_LAYOUT[r][c] === "FREE") return true;
    const chip = this.board[r][c];
    return chip !== null && chip.team === team;
  }

  // Detect NEW sequences for a team. A cell may be part of at most one counted
  // sequence beyond sharing a single overlap cell; we keep it simple and robust:
  // find all straight lines of 5 owned by the team, then lock cells and count
  // sequences that introduce at least 4 not-yet-locked cells.
  _checkSequences(team) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        for (const [dr, dc] of DIRECTIONS) {
          const cells = [];
          let ok = true;
          for (let k = 0; k < 5; k++) {
            const rr = r + dr * k;
            const cc = c + dc * k;
            if (rr < 0 || rr >= BOARD_SIZE || cc < 0 || cc >= BOARD_SIZE) {
              ok = false;
              break;
            }
            if (!this._ownedBy(rr, cc, team)) {
              ok = false;
              break;
            }
            cells.push([rr, cc]);
          }
          if (!ok) continue;

          // Count how many of these cells are not already locked.
          const freshCount = cells.filter(([rr, cc]) => !this.locked[rr][cc]).length;
          // A valid new sequence can share at most one cell with an existing one,
          // so it must contribute at least 4 fresh cells.
          if (freshCount >= 4) {
            for (const [rr, cc] of cells) this.locked[rr][cc] = true;
            this.sequenceCount[team] += 1;
            this.sequencedCells.push({ team, cells });
          }
        }
      }
    }
  }

  // Public snapshot for a specific player (hides other hands).
  stateFor(playerId) {
    return {
      board: this.board,
      locked: this.locked,
      layout: BOARD_LAYOUT,
      seats: this.seats.map((s) => ({ seat: s.seat, team: s.team, id: s.id })),
      currentPlayerId: this.currentPlayerId(),
      currentSeat: this.currentSeat,
      yourHand: this.hands[playerId] || [],
      yourTeam: this.teamOf(playerId),
      yourId: playerId,
      handCounts: Object.fromEntries(
        Object.entries(this.hands).map(([id, h]) => [id, h.length])
      ),
      sequenceCount: this.sequenceCount,
      sequencesToWin: this.sequencesToWin,
      sequencedCells: this.sequencedCells,
      deckRemaining: this.deck.length,
      numTeams: this.numTeams,
      names: this.names || {},
      winner: this.winner,
    };
  }
}
