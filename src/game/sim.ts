/** Mars survival simulation: pure state + tick + actions. All rates are "per Sol". */
export type EventKind = "clear" | "dust" | "flare" | "storm-flare";
export const SOL_EVENTS: EventKind[] = ["clear", "clear", "dust", "clear", "flare", "clear", "dust", "flare", "clear", "storm-flare"];
export const EVENT_INFO: Record<EventKind, { label: string; icon: string; tip: string }> = {
  clear: { label: "Clear skies", icon: "☀️", tip: "Great day for solar power. Store up energy!" },
  dust: { label: "Dust storm", icon: "🌪️", tip: "Dust blocks sunlight and covers the solar panels. Save energy and clean the panels!" },
  flare: { label: "Solar flare", icon: "☢️", tip: "A burst of radiation is coming. Upgrade shielding at the Research Lab!" },
  "storm-flare": { label: "Storm + flare", icon: "⚠️", tip: "The final test: dust AND radiation. Prepare shields, energy and supplies!" },
};
export const DAY_SECONDS = 90;
export const MAX_SOL = 10;

export type SystemId = "oxygen" | "greenhouse" | "drill";
export interface Sim {
  sol: number; time: number; status: "day" | "summary" | "won" | "lost";
  oxygen: number; water: number; food: number; energy: number;
  shield: number; condition: number; exposure: number;
  materials: number; lifeSupport: number; panels: number;
  systems: Record<SystemId, boolean>; scavenged: boolean;
  unpowered: SystemId[]; solar: number;
}

export function newSim(): Sim {
  return { sol: 1, time: 0, status: "day", oxygen: 80, water: 70, food: 60, energy: 70, shield: 30, condition: 100, exposure: 0,
    materials: 40, lifeSupport: 80, panels: 100, systems: { oxygen: true, greenhouse: true, drill: false }, scavenged: false, unpowered: [], solar: 0 };
}

export const RATES = {
  crew: { oxygen: 24, water: 8, food: 10 },
  baseEnergy: 12,
  oxygenGen: { energy: 15, water: 5, oxygen: 30 },
  greenhouse: { energy: 10, water: 10, food: 15, oxygen: 4 },
  drill: { energy: 14, water: 26 },
  solarPeak: 72,
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const eventOf = (s: Sim) => SOL_EVENTS[s.sol - 1] ?? "clear";
export const daylight = (time: number) => Math.max(0.1, Math.sin((Math.PI * time) / DAY_SECONDS));
export const envRadiation = (e: EventKind) => (e === "flare" || e === "storm-flare" ? 5 : e === "dust" ? 0.8 : 1);

/** Advance the simulation by dt seconds (mutates a copy). */
export function tick(prev: Sim, dt: number): Sim {
  if (prev.status !== "day") return prev;
  const s: Sim = { ...prev, systems: { ...prev.systems } };
  const k = dt / DAY_SECONDS;
  const ev = eventOf(s);
  const dusty = ev === "dust" || ev === "storm-flare";

  // Power: solar depends on daylight, weather and panel cleanliness
  s.solar = RATES.solarPeak * daylight(s.time) * (dusty ? 0.35 : 1) * (s.panels / 100);
  s.energy = clamp(s.energy + s.solar * k);
  s.panels = clamp(s.panels - (dusty ? 35 : 10) * k);
  s.lifeSupport = clamp(s.lifeSupport - (dusty ? 14 : 9) * k);

  // Consumers, in priority order. Without enough energy a system stops working.
  const unpowered: SystemId[] = [];
  const use = (e: number) => { if (s.energy >= e * k) { s.energy -= e * k; return true; } s.energy = 0; return false; };
  const baseOk = use(RATES.baseEnergy);
  if (s.systems.oxygen) {
    if (s.water > 0 && use(RATES.oxygenGen.energy)) { s.water -= RATES.oxygenGen.water * k; s.oxygen += RATES.oxygenGen.oxygen * (s.lifeSupport / 100) * k; }
    else unpowered.push("oxygen");
  }
  if (s.systems.greenhouse) {
    if (s.water > 0 && use(RATES.greenhouse.energy)) { s.water -= RATES.greenhouse.water * k; s.food += RATES.greenhouse.food * k; s.oxygen += RATES.greenhouse.oxygen * k; }
    else unpowered.push("greenhouse");
  }
  if (s.systems.drill) {
    if (use(RATES.drill.energy)) s.water += RATES.drill.water * k; else unpowered.push("drill");
  }
  s.unpowered = unpowered;

  // Crew needs
  s.oxygen = clamp(s.oxygen - RATES.crew.oxygen * k);
  s.water = clamp(s.water - RATES.crew.water * k);
  s.food = clamp(s.food - RATES.crew.food * k);

  // Radiation exposure grows when shielding is weak
  const rad = envRadiation(ev) * 12 * (1 - s.shield / 100) - 4;
  s.exposure = clamp(s.exposure + rad * k);

  // Base condition takes damage from shortages and hazards (gradual, never instant)
  let dmg = 0;
  if (s.oxygen <= 0) dmg += 30;
  if (s.water <= 0) dmg += 15;
  if (s.food <= 0) dmg += 15;
  if (s.exposure >= 100) dmg += 25;
  if (!baseOk) dmg += 10;
  if (s.lifeSupport < 25) dmg += 8;
  if (dusty) dmg += 4;
  s.condition = clamp(s.condition - dmg * k);

  s.time = Math.min(DAY_SECONDS, s.time + dt);
  if (s.condition <= 0) s.status = "lost";
  else if (s.time >= DAY_SECONDS) {
    s.exposure = clamp(s.exposure - 15); // rest at night
    s.status = s.sol >= MAX_SOL ? "won" : "summary";
  }
  return s;
}

export function nextSol(s: Sim): Sim {
  if (s.status !== "summary") return s;
  return { ...s, sol: s.sol + 1, time: 0, status: "day", scavenged: false };
}

export interface Action { id: string; label: string; cost?: string }
export function actionsFor(station: string, s: Sim): Action[] {
  switch (station) {
    case "solar": return [{ id: "clean", label: `Clean panels (${Math.round(s.panels)}% clean)`, cost: "5 💧" }];
    case "dome": return [
      { id: "toggle-oxygen", label: `Oxygen generator: ${s.systems.oxygen ? "ON" : "OFF"}` },
      { id: "repair-ls", label: `Fix life support (${Math.round(s.lifeSupport)}%)`, cost: "10 🔩" },
    ];
    case "greenhouse": return [{ id: "toggle-greenhouse", label: `Grow food: ${s.systems.greenhouse ? "ON" : "OFF"}` }];
    case "drill": return [{ id: "toggle-drill", label: `Ice drill: ${s.systems.drill ? "ON" : "OFF"}` }];
    case "lab": return [{ id: "shield", label: `Upgrade shielding (${Math.round(s.shield)}%)`, cost: "25 🔩 + 20 ⚡" }];
    case "hab": return [{ id: "repair-base", label: `Repair base (${Math.round(s.condition)}%)`, cost: "15 🔩 + 10 ⚡" }];
    case "rover": return [{ id: "scavenge", label: s.scavenged ? "Already scavenged today" : "Drive out for materials", cost: "15 ⚡" }];
    default: return [];
  }
}

/** Perform an action. Returns the new state and a message for PIP. */
export function act(prev: Sim, id: string): { sim: Sim; msg: string } {
  const s: Sim = { ...prev, systems: { ...prev.systems } };
  const no = (m: string) => ({ sim: prev, msg: m });
  if (s.status === "won" || s.status === "lost") return no("The mission is over.");
  switch (id) {
    case "toggle-oxygen": case "toggle-greenhouse": case "toggle-drill": {
      const sys = id.slice(7) as SystemId; s.systems[sys] = !s.systems[sys];
      const names = { oxygen: "Oxygen generator", greenhouse: "Greenhouse", drill: "Ice drill" };
      return { sim: s, msg: `${names[sys]} switched ${s.systems[sys] ? "ON — it uses energy" : "OFF — saving energy"}.` };
    }
    case "clean":
      if (s.water < 5) return no("We need 5 water to wash the panels!");
      s.water -= 5; s.panels = 100; return { sim: s, msg: "Sparkly clean! Clean panels catch much more sunlight." };
    case "repair-ls":
      if (s.materials < 10) return no("We need 10 materials. Try the rover!");
      s.materials -= 10; s.lifeSupport = clamp(s.lifeSupport + 40); return { sim: s, msg: "Life support fixed! The oxygen generator works better now." };
    case "shield":
      if (s.shield >= 90) return no("Shielding is at maximum!");
      if (s.materials < 25 || s.energy < 20) return no("Shielding needs 25 materials and 20 energy.");
      s.materials -= 25; s.energy -= 20; s.shield = clamp(s.shield + 15, 0, 90);
      return { sim: s, msg: "Thicker walls! Better shielding blocks more space radiation." };
    case "repair-base":
      if (s.materials < 15 || s.energy < 10) return no("Repairs need 15 materials and 10 energy.");
      s.materials -= 15; s.energy -= 10; s.condition = clamp(s.condition + 20); return { sim: s, msg: "Base repaired. Good as new!" };
    case "scavenge":
      if (s.scavenged) return no("The rover needs to recharge. Try again next Sol!");
      if (s.energy < 15) return no("The rover needs 15 energy.");
      s.energy -= 15; s.materials += 25; s.scavenged = true; return { sim: s, msg: "The rover found 25 materials from old landers and rocks!" };
  }
  return no("");
}

export function warnings(s: Sim): string[] {
  const w: string[] = [];
  if (s.oxygen < 25) w.push(s.oxygen <= 0 ? "OUT OF OXYGEN!" : "Low oxygen");
  if (s.water < 20) w.push(s.water <= 0 ? "No water!" : "Low water");
  if (s.food < 20) w.push(s.food <= 0 ? "No food!" : "Low food");
  if (s.energy < 15) w.push("Power shortage");
  if (s.exposure > 60) w.push("High radiation dose");
  if (s.condition < 35) w.push("Base damaged");
  if (s.lifeSupport < 30) w.push("Life support failing");
  return w;
}
