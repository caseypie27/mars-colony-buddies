import { useEffect, useRef, useState } from "react";
import { GameCanvas, type InputState } from "./GameCanvas";
import { Joystick } from "./Joystick";
import { PipPortrait } from "./Pip";
import { CharacterSelect } from "./CharacterSelect";
import { LANDMARKS } from "@/game/world";
import { loadCharacter, loadSol, resetGame, saveCharacter } from "@/game/storage";
import type { Character, Landmark } from "@/game/types";

const RESOURCES = [
  { name: "Energy", icon: "⚡", value: 80, cls: "bg-res-energy" },
  { name: "Oxygen", icon: "🫧", value: 95, cls: "bg-res-oxygen" },
  { name: "Water", icon: "💧", value: 70, cls: "bg-res-water" },
  { name: "Food", icon: "🥕", value: 60, cls: "bg-res-food" },
];
const WELCOME = "Welcome to Mars, astronaut! I'm PIP, your colony buddy. Let's explore our new home!";

export function MarsGame() {
  const [ready, setReady] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sol, setSol] = useState(1);
  const [pip, setPip] = useState(WELCOME);
  const [found, setFound] = useState<string[]>([]);
  const input = useRef<InputState>({ x: 0, y: 0 });

  useEffect(() => { const c = loadCharacter(); setCharacter(c); setPlaying(!!c); setSol(loadSol()); setReady(true); }, []);

  if (!ready) return <div className="space-bg fixed inset-0" />;
  if (!playing || !character)
    return <CharacterSelect initial={character} onStart={(c) => { saveCharacter(c); setCharacter(c); setFound([]); setPip(WELCOME); setPlaying(true); }} />;

  const onDiscover = (l: Landmark) => {
    setFound((f) => {
      const n = [...f, l.id];
      setPip(n.length === LANDMARKS.length ? "Amazing! You explored the whole colony. You're a true Mars Base Buddy!" : `${l.name}: ${l.pip}`);
      return n;
    });
  };

  return (
    <div className="game-root fixed inset-0 overflow-hidden">
      <GameCanvas character={character} input={input} onDiscover={onDiscover} />
      <div className="pointer-events-none absolute inset-0 p-2 text-hud-fg sm:p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="hud-panel pointer-events-auto rounded-2xl px-3 py-2">
            <div className="font-display text-base font-bold leading-tight sm:text-xl">🪐 Mars Base Buddies</div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="rounded-full bg-primary px-2 font-bold text-primary-foreground">SOL {sol}</span>
              <button onClick={() => { resetGame(); setPlaying(false); setSol(1); }} className="underline decoration-dotted hover:text-accent">Restart / switch astronaut</button>
            </div>
          </div>
          <div className="hud-panel order-last hidden gap-3 rounded-2xl px-3 py-2 md:flex lg:order-none">
            {RESOURCES.map((r) => <Res key={r.name} {...r} />)}
          </div>
          <div className="hud-panel max-w-[46vw] rounded-2xl px-3 py-2 sm:max-w-xs">
            <div className="text-[10px] font-bold uppercase tracking-widest text-accent">Mission</div>
            <div className="text-sm font-semibold sm:text-base">Explore your new Mars colony.</div>
            <div className="mt-1 text-xs text-hud-muted">Places found: {found.length}/{LANDMARKS.length}</div>
          </div>
        </div>
        <div className="hud-panel mx-auto mt-2 flex w-fit gap-3 rounded-2xl px-3 py-1.5 md:hidden">
          {RESOURCES.map((r) => <Res key={r.name} {...r} />)}
        </div>
        <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 sm:inset-x-3 sm:bottom-3">
          <div className="touch-only"><Joystick input={input} /></div>
          <div className="desktop-only hud-panel rounded-xl px-3 py-1.5 text-xs">Move: WASD / Arrow keys</div>
          <div className="hud-panel pointer-events-auto flex max-w-[60vw] items-end gap-2 rounded-2xl p-2 sm:max-w-sm">
            <div className="shrink-0 rounded-xl bg-hud-ink/40 p-1"><PipPortrait size={56} /></div>
            <div>
              <div className="font-display text-sm font-bold text-accent">PIP</div>
              <p key={pip} className="pip-text text-xs leading-snug sm:text-sm">{pip}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Res({ name, icon, value, cls }: { name: string; icon: string; value: number; cls: string }) {
  return (
    <div className="flex items-center gap-1.5" title={name}>
      <span className="text-base">{icon}</span>
      <div className="hidden text-[10px] font-bold uppercase sm:block">{name}</div>
      <div className="h-2 w-10 overflow-hidden rounded-full bg-hud-ink/60 sm:w-14"><div className={`h-full ${cls}`} style={{ width: `${value}%` }} /></div>
      <span className="text-xs font-bold">{value}</span>
    </div>
  );
}
