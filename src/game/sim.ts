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
  usage: number; foodRate: number; waterRate: number;
  research: TechId[]; drillHigh: boolean; capacity: number; objective: number;
}
export type TechId = "panels" | "irrigation" | "recycler" | "deepdrill" | "radmeds";
export const TECHS: Record<TechId, { name: string; energy: number; materials: number; desc: string }> = {
  panels: { name: "Better solar cells", energy: 20, materials: 15, desc: "+25% solar power" },
  irrigation: { name: "Drip irrigation", energy: 25, materials: 10, desc: "Greenhouse uses 40% less water" },
  recycler: { name: "Air recycler", energy: 30, materials: 20, desc: "Crew uses 20% less oxygen" },
  deepdrill: { name: "Deep ice drill", energy: 25, materials: 20, desc: "Ice drill makes 40% more water" },
  radmeds: { name: "Radiation medicine", energy: 30, materials: 25, desc: "Radiation dose heals twice as fast" },
};
const has = (s: Sim, t: TechId) => s.research.includes(t);

export function newSim(): Sim {
  return { sol: 1, time: 0, status: "day", oxygen: 80, water: 70, food: 60, energy: 70, shield: 30, condition: 100, exposure: 0,
    materials: 40, lifeSupport: 80, panels: 100, systems: { oxygen: true, greenhouse: true, drill: false }, scavenged: false, unpowered: [], solar: 0,
    usage: 0, foodRate: 0, waterRate: 0, research: [], drillHigh: false, capacity: 100, objective: 0 };
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
  s.solar = RATES.solarPeak * daylight(s.time) * (dusty ? 0.35 : 1) * (s.panels / 100) * (has(s, "panels") ? 1.25 : 1);
  s.energy = clamp(s.energy + s.solar * k);
  s.panels = clamp(s.panels - (dusty ? 35 : 10) * k);
  s.lifeSupport = clamp(s.lifeSupport - (dusty ? 14 : 9) * k);

  // Consumers, in priority order. Without enough energy a system stops working.
  const unpowered: SystemId[] = [];
  let usage = 0, food = 0, water = 0;
  const use = (e: number) => { usage += e; if (s.energy >= e * k) { s.energy -= e * k; return true; } s.energy = 0; return false; };
  const baseOk = use(RATES.baseEnergy);
  if (s.systems.oxygen) {
    if (s.water > 0 && use(RATES.oxygenGen.energy)) { s.water -= RATES.oxygenGen.water * k; water -= RATES.oxygenGen.water; s.oxygen += RATES.oxygenGen.oxygen * (s.lifeSupport / 100) * k; }
    else unpowered.push("oxygen");
  }
  if (s.systems.greenhouse) {
    if (s.water > 0 && use(RATES.greenhouse.energy)) { const gw = RATES.greenhouse.water * (has(s, "irrigation") ? 0.6 : 1); s.water -= gw * k; water -= gw; food += RATES.greenhouse.food; s.food += RATES.greenhouse.food * k; s.oxygen += RATES.greenhouse.oxygen * k; }
    else unpowered.push("greenhouse");
  }
  if (s.systems.drill) {
    const dw = RATES.drill.water * (s.drillHigh ? 1.7 : 1) * (has(s, "deepdrill") ? 1.4 : 1);
    if (use(RATES.drill.energy * (s.drillHigh ? 1.8 : 1))) { s.water += dw * k; water += dw; } else unpowered.push("drill");
  }
  s.unpowered = unpowered;

  // Crew needs
  const cap = s.capacity;
  s.oxygen = clamp(s.oxygen - RATES.crew.oxygen * (has(s, "recycler") ? 0.8 : 1) * k, 0, cap);
  s.water = clamp(s.water - RATES.crew.water * k, 0, cap);
  s.food = clamp(s.food - RATES.crew.food * k, 0, cap);
  s.usage = usage; s.foodRate = food - RATES.crew.food; s.waterRate = water - RATES.crew.water;

  // Radiation exposure grows when shielding is weak
  const rad = envRadiation(ev) * 12 * (1 - s.shield / 100) - (has(s, "radmeds") ? 8 : 4);
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
    case "drill": return [{ id: "toggle-drill", label: `Ice drill: ${s.systems.drill ? "ON" : "OFF"}` }, { id: "drill-mode", label: `Speed: ${s.drillHigh ? "FAST (more water, much more energy)" : "NORMAL (saves energy)"}` }];
    case "lab": return (Object.keys(TECHS) as TechId[]).filter((t) => !has(s, t)).map((t) => ({ id: `tech-${t}`, label: `${TECHS[t].name}: ${TECHS[t].desc}`, cost: `${TECHS[t].materials} 🔩 + ${TECHS[t].energy} ⚡` }));
    case "shelter": return [{ id: "shield", label: `Upgrade shielding (${Math.round(s.shield)}%)`, cost: "25 🔩 + 20 ⚡" }];
    case "hab": return [
      { id: "repair-base", label: `Repair base (${Math.round(s.condition)}%)`, cost: "15 🔩 + 10 ⚡" },
      { id: "toggle-oxygen", label: `Oxygen generator: ${s.systems.oxygen ? "ON" : "OFF"}` },
      { id: "repair-ls", label: `Fix life support (${Math.round(s.lifeSupport)}%)`, cost: "10 🔩" },
    ];
    case "storage": return s.capacity >= 160 ? [] : [{ id: "storage", label: `Expand storage (max ${s.capacity} → ${s.capacity + 30})`, cost: "20 🔩" }];
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
    case "drill-mode":
      s.drillHigh = !s.drillHigh; return { sim: s, msg: s.drillHigh ? "Fast drilling: lots more water, but it drinks almost twice the energy!" : "Normal drilling: less water, but we save energy." };
    case "storage":
      if (s.capacity >= 160) return no("Storage is as big as it can get!");
      if (s.materials < 20) return no("Not enough materials! Expanding storage needs 20 🔩 — try the rover.");
      s.materials -= 20; s.capacity += 30; return { sim: s, msg: `Bigger tanks! We can now store up to ${s.capacity} oxygen, water and food, so we can save extra for storms.` };
    case "clean":
      if (s.water < 5) return no("We need 5 water to wash the panels!");
      s.water -= 5; s.panels = 100; return { sim: s, msg: "Sparkly clean! Clean panels catch much more sunlight." };
    case "repair-ls":
      if (s.materials < 10) return no("We need 10 materials. Try the rover!");
      s.materials -= 10; s.lifeSupport = clamp(s.lifeSupport + 40); return { sim: s, msg: "Life support fixed! The oxygen generator works better now." };
    case "shield":
      if (s.shield >= 90) return no("Shielding is at maximum!");
      if (s.materials < 25 || s.energy < 20) return no("Shielding needs 25 materials and 20 energy. Without it, radiation keeps building up in our bodies!");
      s.materials -= 25; s.energy -= 20; s.shield = clamp(s.shield + 15, 0, 90);
      return { sim: s, msg: `Thicker walls! Shielding is now ${s.shield}%, so only ${100 - s.shield}% of space radiation gets through to the crew.` };
    case "repair-base":
      if (s.materials < 15 || s.energy < 10) return no("Repairs need 15 materials and 10 energy.");
      s.materials -= 15; s.energy -= 10; s.condition = clamp(s.condition + 20); return { sim: s, msg: "Base repaired. Good as new!" };
    case "scavenge":
      if (s.scavenged) return no("The rover needs to recharge. Try again next Sol!");
      if (s.energy < 15) return no("The rover needs 15 energy.");
      s.energy -= 15; s.materials += 25; s.scavenged = true; return { sim: s, msg: "The rover found 25 materials from old landers and rocks!" };
  }
  if (id.startsWith("tech-")) {
    const t = id.slice(5) as TechId, T = TECHS[t];
    if (!T || has(s, t)) return no("Already researched!");
    if (s.materials < T.materials || s.energy < T.energy) return no(`Research needs ${T.materials} materials and ${T.energy} energy. Spending energy here means less for food and water!`);
    s.materials -= T.materials; s.energy -= T.energy; s.research = [...s.research, t];
    return { sim: s, msg: `Research complete: ${T.name}! ${T.desc}.` };
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

/** Readouts shown in a building's panel. */
export function infoFor(station: string, s: Sim): string[] {
  const r = Math.round, sign = (n: number) => (n >= 0 ? "+" : "") + r(n);
  switch (station) {
    case "solar": return [`Making ${r(s.solar)} ⚡/Sol right now`, `Using ${r(s.usage)} ⚡/Sol`, `Panels ${r(s.panels)}% clean · ${EVENT_INFO[eventOf(s)].label}`];
    case "greenhouse": return [`Food ${sign(s.foodRate)}/Sol (crew eats ${RATES.crew.food})`, `Uses ${RATES.greenhouse.energy} ⚡ and ${r(RATES.greenhouse.water * (has(s, "irrigation") ? 0.6 : 1))} 💧 per Sol`, s.unpowered.includes("greenhouse") ? "⚠️ Not growing: no power or water" : s.systems.greenhouse ? "Growing ✅" : "Switched off"];
    case "drill": return [`Water ${sign(s.waterRate)}/Sol overall`, `Stored ${r(s.water)}/${s.capacity}`, s.unpowered.includes("drill") ? "⚠️ Stopped: no power" : s.systems.drill ? "Drilling ✅" : "Switched off"];
    case "hab": case "dome": return [`Oxygen ${r(s.oxygen)} · Life support ${r(s.lifeSupport)}%`, `Base condition ${r(s.condition)}% · Radiation dose ${r(s.exposure)}`];
    case "lab": return [`Researched ${s.research.length}/5`, "Research uses energy and materials — less left for food and water."];
    case "shelter": return [`Shielding ${r(s.shield)}%: blocks ${r(s.shield)}% of radiation`, `Crew dose ${r(s.exposure)}/100 — at 100 the base gets damaged`, `Today's radiation: ${envRadiation(eventOf(s))}x normal`];
    case "storage": return [`🫧 ${r(s.oxygen)} · 💧 ${r(s.water)} · 🥕 ${r(s.food)} (max ${s.capacity})`, `⚡ ${r(s.energy)} · 🔩 ${s.materials}`, `Water ${sign(s.waterRate)}/Sol · Food ${sign(s.foodRate)}/Sol`];
    case "rover": return [`Materials: ${s.materials} 🔩`, s.scavenged ? "Rover is recharging until next Sol" : "Rover is ready"];
  }
  return [];
}

export interface Objective { title: string; hint: string; done: (s: Sim) => boolean }
export const OBJECTIVES: Objective[] = [
  { title: "Establish a working habitat", hint: "Fix life support to 90% at the Habitat or Dome", done: (s) => s.lifeSupport >= 90 },
  { title: "Secure water", hint: "Store 80 water using the Ice Drill", done: (s) => s.water >= 80 },
  { title: "Produce enough food", hint: "Grow food in the Greenhouse until you have 75", done: (s) => s.food >= 75 },
  { title: "Complete your first research", hint: "Research a technology at the Research Lab", done: (s) => s.research.length >= 1 },
  { title: "Improve radiation protection", hint: "Get shielding to 60% at the Radiation Shelter", done: (s) => s.shield >= 60 },
  { title: "Reliable energy", hint: "End a Sol with 50+ energy", done: (s) => s.status === "summary" && s.energy >= 50 },
  { title: "Expand storage", hint: "Build bigger tanks at the Storage Depot", done: (s) => s.capacity > 100 },
  { title: "Survive the solar flare", hint: "Reach Sol 6 with radiation dose under 50", done: (s) => s.sol >= 6 && s.exposure < 50 },
  { title: "Master scientist", hint: "Research 4 technologies", done: (s) => s.research.length >= 4 },
  { title: "Survive 10 Sols", hint: "Keep the colony alive to the end", done: (s) => s.status === "won" },
];
export const OBJECTIVE_REWARD = 10;
/** Completes the current objective if met (reward: materials). */
export function checkObjective(s: Sim): { sim: Sim; done?: Objective } {
  const o = OBJECTIVES[s.objective];
  if (!o || !o.done(s)) return { sim: s };
  return { sim: { ...s, objective: s.objective + 1, materials: s.materials + OBJECTIVE_REWARD }, done: o };
}
