// Standard Sequence board layout (10x10).
// Each non-Jack card appears exactly twice. The four corners are FREE (wild) spaces.
// Card codes: rank + suit. Ranks: A 2 3 4 5 6 7 8 9 T Q K  (no Jacks on board).
// Suits: S=spades, H=hearts, D=diamonds, C=clubs. "FREE" = corner wild space.

export const BOARD_LAYOUT = [
  ["FREE", "2S", "3S", "4S", "5S", "6S", "7S", "8S", "9S", "FREE"],
  ["6C",   "5C", "4C", "3C", "2C", "AH", "KH", "QH", "TH", "TS"],
  ["7C",   "AS", "2D", "3D", "4D", "5D", "6D", "7D", "9H", "QS"],
  ["8C",   "KS", "6C", "5C", "4C", "3C", "2C", "8D", "8H", "KS"],
  ["9C",   "QS", "7C", "6H", "5H", "4H", "AH", "9D", "7H", "AS"],
  ["TC",   "TS", "8C", "7H", "2H", "3H", "KH", "TD", "6H", "2D"],
  ["QC",   "9S", "9C", "8H", "9H", "TH", "QH", "QD", "5H", "3D"],
  ["KC",   "8S", "TC", "QC", "KC", "AC", "AD", "KD", "4H", "4D"],
  ["AC",   "7S", "6S", "5S", "4S", "3S", "2S", "2H", "3H", "5D"],
  ["FREE", "AD", "KD", "QD", "TD", "9D", "8D", "7D", "6D", "FREE"],
];

export const BOARD_SIZE = 10;

export function isFree(r, c) {
  return BOARD_LAYOUT[r][c] === "FREE";
}
