import type { Character } from "./types";
const KEY = "mbb.character";
const SOL = "mbb.sol";
export function loadCharacter(): Character | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(KEY);
  return v === "boy" || v === "girl" ? v : null;
}
export function saveCharacter(c: Character) { localStorage.setItem(KEY, c); }
export function loadSol(): number {
  if (typeof window === "undefined") return 1;
  return Math.max(1, Number(localStorage.getItem(SOL)) || 1);
}
export function resetGame() { localStorage.removeItem(KEY); localStorage.removeItem(SOL); }
