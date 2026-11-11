import { useEffect, useRef, useState } from "react";
import { GameCanvas, type InputState } from "./GameCanvas";
import { Joystick } from "./Joystick";
import { PipPortrait } from "./Pip";
import { CharacterSelect } from "./CharacterSelect";
import { BUILDINGS, LANDMARKS } from "@/game/world";
import { loadCharacter, loadSim, resetGame, saveCharacter, saveSim } from "@/game/storage";
import { act, actionsFor, DAY_SECONDS, EVENT_INFO, eventOf, MAX_SOL, newSim, nextSol, SOL_EVENTS, tick, warnings, type Sim } from "@/game/sim";
import type { Character, Landmark } from "@/game/types";

const WELCOME = "Welcome to Mars, astronaut! I'm PIP, your colony buddy. Let's explore our new home!";
const STATION_NAMES: Record<string, string> = { solar: "Solar Farm", dome: "Command Dome · Life Support", greenhouse: "Greenhouse", drill: "Ice Drill", lab: "Research Lab · Shielding", hab: "Habitat · Repairs", rover: "Rover" };

function nearestStation(x: number, y: number): string | null {
  for (const b of BUILDINGS) {
    if (b.kind === "lander" || b.kind === "antenna") continue;
    if (Math.hypot(x - (b.x + b.w / 2), y - (b.y + b.h / 2)) < Math.max(b.w, b.h) / 2 + 90) return b.kind;
  }
  return null;
}

export function MarsGame() {
  const [ready, setReady] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sim, setSim] = useState<Sim>(newSim);
  const [pip, setPip] = useState(WELCOME);
  const [found, setFound] = useState<string[]>([]);
  const [station, setStation] = useState<string | null>(null);
  const [banner, setBanner] = useState(0);
  const input = useRef<InputState>({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const simRef = useRef(sim);
  simRef.current = sim;

  useEffect(() => { const c = loadCharacter(); setCharacter(c); setPlaying(!!c); setSim(loadSim() ?? newSim()); setReady(true); }, []);

  // Simulation clock + station proximity
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), saved = 0;
    const id = setInterval(() => {
      const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
      const prev = simRef.current, next = tick(prev, dt);
      if (next !== prev) {
        setSim(next);
        if (next.status !== prev.status) {
          if (next.status === "summary") setPip(`Sol ${next.sol} is over! Check our supplies and get ready for tomorrow.`);
          if (next.status === "won") setPip("We survived 10 Sols on Mars! You're a true Mars Base Buddy!");
          if (next.status === "lost") setPip("Oh no, the base is too damaged. Let's learn from it and try again!");
        } else { const w = warnings(next)[0]; if (w && w !== warnings(prev)[0]) setPip(`Warning: ${w}! Let's fix that fast.`); }
        if ((saved += dt) > 3 || next.status !== prev.status) { saved = 0; saveSim(next); }
      }
      setStation(nearestStation(pos.current.x, pos.current.y));
    }, 200);
    return () => clearInterval(id);
  }, [playing]);

  const doAction = (aid: string) => { const r = act(simRef.current, aid); setSim(r.sim); saveSim(r.sim); if (r.msg) setPip(r.msg); };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "e" && station) { const a = actionsFor(station, simRef.current)[0]; if (a) doAction(a.id); } };
    window.addEventListener("keydown", kd); return () => window.removeEventListener("keydown", kd);
  }, [station]);

  if (!ready) return <div className="space-bg fixed inset-0" />;
  if (!playing || !character)
    return <CharacterSelect initial={character} onStart={(c) => { saveCharacter(c); const s = newSim(); saveSim(s); setSim(s); setCharacter(c); setFound([]); setPip(WELCOME); setPlaying(true); }} />;

  const onDiscover = (l: Landmark) => setFound((f) => { const n = [...f, l.id]; setPip(`${l.name}: ${l.pip}`); return n; });
  const ev = eventOf(sim), info = EVENT_INFO[ev];
  const warn = warnings(sim);
  const beginSol = () => { const s = nextSol(sim); setSim(s); saveSim(s); setBanner((b) => b + 1); const i = EVENT_INFO[eventOf(s)]; setPip(`Sol ${s.sol}: ${i.label}! ${i.tip}`); };
  const restart = () => { const s = newSim(); setSim(s); saveSim(s); setPip(WELCOME); setBanner((b) => b + 1); };
  const res = [
    { name: "Oxygen", icon: "🫧", value: sim.oxygen, cls: "bg-res-oxygen", low: 25 },
    { name: "Water", icon: "💧", value: sim.water, cls: "bg-res-water", low: 20 },
    { name: "Food", icon: "🥕", value: sim.food, cls: "bg-res-food", low: 20 },
    { name: "Energy", icon: "⚡", value: sim.energy, cls: "bg-res-energy", low: 15 },
    { name: "Shield", icon: "🛡️", value: sim.shield, cls: "bg-res-shield", low: -1 },
    { name: "Base", icon: "🏠", value: sim.condition, cls: "bg-res-condition", low: 35 },
  ];
  const resBar = (
    <>
      {res.map((r) => <Res key={r.name} {...r} />)}
      <div className={`flex items-center gap-1 text-xs font-bold ${sim.exposure > 60 ? "text-destructive animate-pulse" : ""}`} title="Radiation dose (lower is better)">☢️ {Math.round(sim.exposure)}</div>
      <div className="flex items-center gap-1 text-xs font-bold" title="Building materials">🔩 {sim.materials}</div>
    </>
  );
  const actions = station ? actionsFor(station, sim) : [];
  const off = sim.unpowered.length > 0;

  return (
    <div className="game-root fixed inset-0 overflow-hidden">
      <GameCanvas character={character} input={input} onDiscover={onDiscover} posRef={pos} />
      {(ev === "dust" || ev === "storm-flare") && sim.status === "day" && <div className="weather-dust pointer-events-none absolute inset-0" />}
      {(ev === "flare" || ev === "storm-flare") && sim.status === "day" && <div className="weather-flare pointer-events-none absolute inset-0" />}
      <div className="pointer-events-none absolute inset-0 p-2 text-hud-fg sm:p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="hud-panel pointer-events-auto rounded-2xl px-3 py-2">
            <div className="font-display text-base font-bold leading-tight sm:text-xl">🪐 Mars Base Buddies</div>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span className="whitespace-nowrap rounded-full bg-primary px-2 font-bold text-primary-foreground">SOL {sim.sol}/{MAX_SOL}</span>
              <span className="whitespace-nowrap" title={info.tip}>{info.icon} {info.label}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-hud-ink/60" title="Time of day"><div className="h-full bg-accent" style={{ width: `${(sim.time / DAY_SECONDS) * 100}%` }} /></div>
            <button onClick={() => { resetGame(); setPlaying(false); }} className="mt-1 text-xs underline decoration-dotted hover:text-accent">Restart / switch astronaut</button>
          </div>
          <div className="hud-panel order-last hidden flex-wrap items-center gap-3 rounded-2xl px-3 py-2 lg:flex lg:order-none">{resBar}</div>
          <div className="hud-panel max-w-[46vw] rounded-2xl px-3 py-2 sm:max-w-xs">
            <div className="text-[10px] font-bold uppercase tracking-widest text-accent">Mission</div>
            <div className="text-sm font-semibold sm:text-base">Keep the colony alive for {MAX_SOL} Sols.</div>
            <div className="mt-1 text-xs text-hud-muted">Places found: {found.length}/{LANDMARKS.length}</div>
            {off && <div className="mt-1 text-xs font-bold text-destructive">⚡ No power: {sim.unpowered.join(", ")}</div>}
          </div>
        </div>
        <div className="hud-panel mx-auto mt-2 flex w-fit max-w-full flex-wrap justify-center gap-x-3 gap-y-1 rounded-2xl px-3 py-1.5 lg:hidden">{resBar}</div>
        {warn.length > 0 && (
          <div className="mx-auto mt-2 flex w-fit max-w-full flex-wrap justify-center gap-1">
            {warn.map((w) => <span key={w} className="animate-pulse rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">⚠️ {w}</span>)}
          </div>
        )}

        {sim.status === "day" && banner > 0 && (
          <div key={banner} className="sol-banner absolute inset-x-0 top-1/3 text-center">
            <div className="font-display text-4xl font-bold drop-shadow-lg sm:text-6xl">SOL {sim.sol}</div>
            <div className="text-lg font-bold">{info.icon} {info.label}</div>
          </div>
        )}

        {sim.status !== "day" && (
          <div className="hud-panel pointer-events-auto absolute left-1/2 top-1/2 w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-4 text-center">
            {sim.status === "summary" && <>
              <div className="font-display text-2xl font-bold">Sol {sim.sol} complete! 🌙</div>
              <p className="mt-1 text-sm text-hud-muted">Time is paused. Walk to buildings to switch systems, repair or upgrade before tomorrow.</p>
              <div className="mt-3 rounded-xl bg-hud-ink/40 p-2 text-sm"><b>Tomorrow: {EVENT_INFO[SOL_EVENTS[sim.sol]].icon} {EVENT_INFO[SOL_EVENTS[sim.sol]].label}</b><div className="text-xs">{EVENT_INFO[SOL_EVENTS[sim.sol]].tip}</div></div>
              <button onClick={beginSol} className="start-btn mt-3 rounded-xl px-5 py-2 font-bold">Begin Sol {sim.sol + 1}</button>
            </>}
            {sim.status !== "summary" && <>
              <div className="font-display text-2xl font-bold">{sim.status === "won" ? "Mission complete! 🎉" : "Mission failed"}</div>
              <p className="mt-1 text-sm">{sim.status === "won" ? `You kept the colony alive for ${MAX_SOL} Sols!` : `The base broke down on Sol ${sim.sol}. Balance energy, water and shields next time!`}</p>
              <button onClick={restart} className="start-btn mt-3 rounded-xl px-5 py-2 font-bold">Play again</button>
            </>}
          </div>
        )}

        {station && actions.length > 0 && (
          <div className="hud-panel pointer-events-auto absolute bottom-[38%] left-1/2 w-[min(90vw,320px)] -translate-x-1/2 rounded-2xl p-2 sm:bottom-28">
            <div className="mb-1 text-center text-xs font-bold uppercase tracking-wider text-accent">{STATION_NAMES[station]}</div>
            {actions.map((a, i) => (
              <button key={a.id} onClick={() => doAction(a.id)} className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl bg-primary px-3 py-1.5 text-left text-sm font-bold text-primary-foreground active:scale-95">
                <span>{i === 0 && <span className="desktop-only mr-1 rounded bg-hud-ink/40 px-1 text-xs">E</span>}{a.label}</span>{a.cost && <span className="whitespace-nowrap text-xs">{a.cost}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 sm:inset-x-3 sm:bottom-3">
          <div className="touch-only"><Joystick input={input} /></div>
          <div className="desktop-only hud-panel rounded-xl px-3 py-1.5 text-xs">Move: WASD / Arrows · Use: E</div>
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

function Res({ name, icon, value, cls, low }: { name: string; icon: string; value: number; cls: string; low: number }) {
  const v = Math.round(value), danger = value < low;
  return (
    <div className={`flex items-center gap-1 ${danger ? "animate-pulse" : ""}`} title={name}>
      <span className="text-sm">{icon}</span>
      <div className="hidden text-[10px] font-bold uppercase xl:block">{name}</div>
      <div className="h-2 w-7 overflow-hidden rounded-full bg-hud-ink/60 sm:w-12"><div className={`h-full ${danger ? "bg-destructive" : cls}`} style={{ width: `${v}%` }} /></div>
      <span className={`text-xs font-bold ${danger ? "text-destructive" : ""}`}>{v}</span>
    </div>
  );
}
