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
  seed: number; event: { kind: EventId; target?: Breakable } | null; eventSol: number; eventsHandled: number;
  broken: Breakable | null; discoveries: string[]; reviewed: string[]; extraSites: string[];
  achievements: string[]; foodMade: number; log: LogEntry[];
}
export interface LogEntry { sol: number; icon: string; text: string }
export type Breakable = "oxygen" | "greenhouse" | "drill" | "panels";
export const BREAK_NAMES: Record<Breakable, string> = { oxygen: "Oxygen generator", greenhouse: "Greenhouse pump", drill: "Ice drill", panels: "Solar panel wiring" };
export const BREAK_STATION: Record<Breakable, string> = { oxygen: "dome", greenhouse: "greenhouse", drill: "drill", panels: "solar" };
export function addLog(s: Sim, icon: string, text: string) { s.log = [{ sol: s.sol, icon, text }, ...s.log].slice(0, 60); }
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
    usage: 0, foodRate: 0, waterRate: 0, research: [], drillHigh: false, capacity: 100, objective: 0,
    seed: Math.floor(Math.random() * 1000), event: null, eventSol: 1, eventsHandled: 0, broken: null, discoveries: [], reviewed: [], extraSites: [],
    achievements: [], foodMade: 0, log: [{ sol: 1, icon: "🚀", text: "Landed on Mars. Mission begins!" }] };
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
  if (prev.status !== "day" || prev.event) return prev;
  const s: Sim = { ...prev, systems: { ...prev.systems } };
  const k = dt / DAY_SECONDS;
  const ev = eventOf(s);
  const dusty = ev === "dust" || ev === "storm-flare";

  // Power: solar depends on daylight, weather and panel cleanliness
  s.solar = RATES.solarPeak * daylight(s.time) * (dusty ? 0.35 : 1) * (s.panels / 100) * (has(s, "panels") ? 1.25 : 1) * (s.broken === "panels" ? 0.5 : 1);
  s.energy = clamp(s.energy + s.solar * k);
  s.panels = clamp(s.panels - (dusty ? 35 : 10) * k);
  s.lifeSupport = clamp(s.lifeSupport - (dusty ? 14 : 9) * k);

  // Consumers, in priority order. Without enough energy a system stops working.
  const unpowered: SystemId[] = [];
  let usage = 0, food = 0, water = 0;
  const use = (e: number) => { usage += e; if (s.energy >= e * k) { s.energy -= e * k; return true; } s.energy = 0; return false; };
  const baseOk = use(RATES.baseEnergy);
  if (s.systems.oxygen && s.broken === "oxygen") unpowered.push("oxygen");
  else if (s.systems.oxygen) {
    if (s.water > 0 && use(RATES.oxygenGen.energy)) { s.water -= RATES.oxygenGen.water * k; water -= RATES.oxygenGen.water; s.oxygen += RATES.oxygenGen.oxygen * (s.lifeSupport / 100) * k; }
    else unpowered.push("oxygen");
  }
  if (s.systems.greenhouse && s.broken === "greenhouse") unpowered.push("greenhouse");
  else if (s.systems.greenhouse) {
    if (s.water > 0 && use(RATES.greenhouse.energy)) { const gw = RATES.greenhouse.water * (has(s, "irrigation") ? 0.6 : 1); s.water -= gw * k; water -= gw; food += RATES.greenhouse.food; s.foodMade += RATES.greenhouse.food * k; s.food += RATES.greenhouse.food * k; s.oxygen += RATES.greenhouse.oxygen * k; }
    else unpowered.push("greenhouse");
  }
  if (s.systems.drill && s.broken === "drill") unpowered.push("drill");
  else if (s.systems.drill) {
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
  // Random Martian event: at most one per Sol (from Sol 2), mid-day, seeded so it's fair
  if (s.sol >= 2 && s.eventSol < s.sol && s.time > 25 + rnd(s, 1) * 35) {
    s.eventSol = s.sol;
    if (rnd(s, 2) < 0.8) {
      const pool: EventId[] = ["malfunction", "water", "breakthrough", "radiation", "dustdevil"];
      const kind = pool[Math.floor(rnd(s, 3) * pool.length)] ?? "water";
      const targets: Breakable[] = ["oxygen", "greenhouse", "drill", "panels"];
      s.event = { kind, target: kind === "malfunction" ? targets[Math.floor(rnd(s, 4) * 4)] : undefined };
      addLog(s, EVENTS[kind].icon, `Event: ${EVENTS[kind].title}`);
    }
  }
  if (s.condition <= 0) { s.status = "lost"; addLog(s, "💥", "The base broke down."); }
  else if (s.time >= DAY_SECONDS) {
    s.exposure = clamp(s.exposure - 15); // rest at night
    s.status = s.sol >= MAX_SOL ? "won" : "summary";
    addLog(s, s.status === "won" ? "🏁" : "🌙", s.status === "won" ? "Survived all 10 Sols!" : `Sol ${s.sol} survived`);
  }
  return s;
}

export function nextSol(s: Sim): Sim {
  if (s.status !== "summary") return s;
  const n = { ...s, sol: s.sol + 1, time: 0, status: "day" as const, scavenged: false };
  addLog(n, "🌅", `Sol ${n.sol} begins: ${EVENT_INFO[eventOf(n)].label}`);
  return n;
}

export interface Action { id: string; label: string; cost?: string }
export function actionsFor(station: string, s: Sim): Action[] {
  const fix: Action[] = s.broken && BREAK_STATION[s.broken] === station ? [{ id: "fix-broken", label: `🔧 Repair ${BREAK_NAMES[s.broken]}`, cost: "10 🔩" }] : [];
  if (station.startsWith("site:")) {
    const site = SITES.find((x) => x.id === station.slice(5));
    if (!site || s.discoveries.includes(site.id)) return [];
    const c = scanCost(s);
    return [{ id: `scan-${site.id}`, label: `Scan ${site.name}`, cost: `${c.energy} ⚡ + ${c.oxygen} 🫧` }];
  }
  if (station === "lab") {
    const rev = s.discoveries.filter((d) => !s.reviewed.includes(d)).map((d) => { const x = SITES.find((y) => y.id === d)!; return { id: `review-${d}`, label: `📋 Study ${x.discovery}`, cost: x.rewardText }; });
    return [...rev, ...baseActions(station, s)];
  }
  return [...fix, ...baseActions(station, s)];
}
function baseActions(station: string, s: Sim): Action[] {
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
    case "fix-broken":
      if (!s.broken) return no("Nothing is broken.");
      if (s.materials < 10) return no("Repairs need 10 materials. Try the rover!");
      addLog(s, "🔧", `Repaired ${BREAK_NAMES[s.broken]}`);
      s.materials -= 10; s.broken = null; return { sim: s, msg: "Fixed! The system is working again." };
    case "clean":
      if (s.water < 5) return no("We need 5 water to wash the panels!");
      s.water -= 5; s.panels = 100; return { sim: s, msg: "Sparkly clean! Clean panels catch much more sunlight." };
    case "repair-ls":
      if (s.materials < 10) return no("We need 10 materials. Try the rover!");
      s.materials -= 10; s.lifeSupport = clamp(s.lifeSupport + 40); return { sim: s, msg: "Life support fixed! The oxygen generator works better now." };
    case "shield":
      if (s.shield >= 90) return no("Shielding is at maximum!");
      if (s.materials < 25 || s.energy < 20) return no("Shielding needs 25 materials and 20 energy. Without it, radiation keeps building up in our bodies!");
      s.materials -= 25; s.energy -= 20; s.shield = clamp(s.shield + 15, 0, 90); addLog(s, "🛡️", `Shielding upgraded to ${s.shield}%`);
      return { sim: s, msg: `Thicker walls! Shielding is now ${s.shield}%, so only ${100 - s.shield}% of space radiation gets through to the crew.` };
    case "repair-base":
      if (s.materials < 15 || s.energy < 10) return no("Repairs need 15 materials and 10 energy.");
      s.materials -= 15; s.energy -= 10; s.condition = clamp(s.condition + 20); return { sim: s, msg: "Base repaired. Good as new!" };
    case "scavenge":
      if (s.scavenged) return no("The rover needs to recharge. Try again next Sol!");
      if (s.energy < 15) return no("The rover needs 15 energy.");
      s.energy -= 15; s.materials += 25; s.scavenged = true; return { sim: s, msg: "The rover found 25 materials from old landers and rocks!" };
  }
  if (id.startsWith("scan-")) {
    const site = SITES.find((x) => x.id === id.slice(5)), c = scanCost(s);
    if (!site || s.discoveries.includes(site.id)) return no("Already scanned!");
    if (s.energy < c.energy || s.oxygen < c.oxygen) return no(`Scanning needs ${c.energy} energy and ${c.oxygen} oxygen for your suit.`);
    s.energy -= c.energy; s.oxygen -= c.oxygen; s.discoveries = [...s.discoveries, site.id];
    addLog(s, "🔍", `Discovered: ${site.discovery}`);
    return { sim: s, msg: `Discovery! ${site.fact} Bring it to the Research Lab to study it.` };
  }
  if (id.startsWith("review-")) {
    const site = SITES.find((x) => x.id === id.slice(7));
    if (!site || s.reviewed.includes(site.id)) return no("Already studied!");
    s.reviewed = [...s.reviewed, site.id]; const g = site.reward;
    if (g.water) s.water = clamp(s.water + g.water, 0, s.capacity);
    if (g.materials) s.materials += g.materials;
    if (g.food) s.food = clamp(s.food + g.food, 0, s.capacity);
    if (g.energy) s.energy = clamp(s.energy + g.energy);
    if (g.shield) s.shield = clamp(s.shield + g.shield, 0, 90);
    if (g.lifeSupport) s.lifeSupport = clamp(s.lifeSupport + g.lifeSupport);
    addLog(s, "🔬", `Studied ${site.discovery}: ${site.rewardText}`);
    return { sim: s, msg: `Science! ${site.lesson} (${site.rewardText})` };
  }
  if (id.startsWith("tech-")) {
    const t = id.slice(5) as TechId, T = TECHS[t];
    if (!T || has(s, t)) return no("Already researched!");
    if (s.materials < T.materials || s.energy < T.energy) return no(`Research needs ${T.materials} materials and ${T.energy} energy. Spending energy here means less for food and water!`);
    s.materials -= T.materials; s.energy -= T.energy; s.research = [...s.research, t]; addLog(s, "🧪", `Researched ${T.name}`);
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
    case "lab": return [`Researched ${s.research.length}/5 · Discoveries studied ${s.reviewed.length}/${s.discoveries.length}`, "Research uses energy and materials — less left for food and water."];
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
  const n = { ...s, objective: s.objective + 1, materials: s.materials + OBJECTIVE_REWARD };
  addLog(n, "🏆", `Objective complete: ${o.title}`);
  return { sim: n, done: o };
}

function rnd(s: Sim, salt: number) { const x = Math.sin(s.seed * 12.9898 + s.sol * 78.233 + salt * 37.719) * 43758.5453; return x - Math.floor(x); }
export function scanCost(s: Sim) { const d = eventOf(s) === "dust" || eventOf(s) === "storm-flare"; return { energy: d ? 12 : 6, oxygen: d ? 8 : 4 }; }

// ---------- Exploration sites ----------
export interface Site { id: string; name: string; x: number; y: number; kind: "ice" | "layers" | "soil" | "dunes" | "meteorite" | "plain" | "weather" | "cave"; discovery: string; fact: string; lesson: string; reward: Partial<Record<"water" | "materials" | "food" | "energy" | "shield" | "lifeSupport", number>>; rewardText: string; hidden?: boolean }
export const SITES: Site[] = [
  { id: "ice", name: "Frosty crater", x: 330, y: 1250, kind: "ice", discovery: "Underground water ice", fact: "There's frozen water hiding under the dust!", lesson: "Mars has lots of ice underground, especially near the poles. Future colonies could drink it!", reward: { water: 30 }, rewardText: "+30 💧" },
  { id: "layers", name: "Striped cliffs", x: 1750, y: 2230, kind: "layers", discovery: "Layered rock formation", fact: "These stripes are layers of rock laid down over millions of years.", lesson: "Rock layers can form in ancient lakes. Mars may once have had rivers and lakes!", reward: { materials: 20 }, rewardText: "+20 🔩" },
  { id: "soil", name: "Rusty soil patch", x: 600, y: 1600, kind: "soil", discovery: "Martian soil sample", fact: "Mars soil is red because it's full of rusty iron!", lesson: "Martian soil has salts that are bad for plants, so we wash it before growing food.", reward: { food: 15 }, rewardText: "+15 🥕" },
  { id: "dunes", name: "Ripple dunes", x: 300, y: 2150, kind: "dunes", discovery: "Wind-blown dust dunes", fact: "Wind shaped these sand ripples into waves.", lesson: "Knowing how dust moves helps us build filters that keep life support clean.", reward: { lifeSupport: 20 }, rewardText: "+20% life support" },
  { id: "weather", name: "Windy ridge", x: 520, y: 520, kind: "weather", discovery: "Weather measurements", fact: "It's about −60°C here and the air is super thin!", lesson: "Mars air is 100 times thinner than Earth's. Measuring sunlight helps us plan solar power.", reward: { energy: 25 }, rewardText: "+25 ⚡" },
  { id: "meteorite", name: "Shiny meteorite", x: 3000, y: 2200, kind: "meteorite", discovery: "Iron meteorite", fact: "A space rock made of metal fell here!", lesson: "Iron meteorites are great building materials for a colony.", reward: { materials: 25 }, rewardText: "+25 🔩" },
  { id: "plain", name: "Flat plain", x: 1500, y: 560, kind: "plain", discovery: "Future outpost site", fact: "This flat, safe ground is perfect for building more habitats one day.", lesson: "Good outpost sites are flat, close to ice and sunny. We'll store more supplies thanks to this plan.", reward: { materials: 10, water: 10 }, rewardText: "+10 🔩 +10 💧" },
  { id: "cave", name: "Lava tube cave", x: 3050, y: 520, kind: "cave", discovery: "Lava tube cave", fact: "An old lava tunnel! Its rock roof blocks radiation.", lesson: "Caves could protect future astronauts from radiation. We copied the idea for our walls.", reward: { shield: 5 }, rewardText: "+5% shielding" },
  { id: "ice2", name: "Ice signal", x: 2950, y: 1650, kind: "ice", discovery: "Buried ice sheet", fact: "A huge sheet of buried ice — just like the signal said!", lesson: "Radar from orbit can find ice hidden under the ground.", reward: { water: 40 }, rewardText: "+40 💧", hidden: true },
];
export const visibleSites = (s: Sim) => SITES.filter((x) => !x.hidden || s.extraSites.includes(x.id));

// ---------- Random events with choices ----------
export type EventId = "malfunction" | "water" | "breakthrough" | "radiation" | "dustdevil";
export interface Choice { label: string; pro: string; con: string; apply: (s: Sim) => Sim | string }
export const EVENTS: Record<EventId, { title: string; icon: string; text: (s: Sim) => string; choices: (s: Sim) => Choice[] }> = {
  malfunction: { title: "Equipment malfunction", icon: "🔧", text: (s) => `The ${BREAK_NAMES[s.event?.target ?? "drill"]} has broken down!`,
    choices: () => [
      { label: "Fix it right now", pro: "Works again immediately", con: "−15 🔩 (rush job)", apply: (s) => s.materials < 15 ? "Not enough materials for a rush repair!" : { ...s, materials: s.materials - 15, broken: null } },
      { label: "Fix it later", pro: "Keep your materials", con: "Stays broken until you repair it at its building (10 🔩)", apply: (s) => ({ ...s, broken: s.event?.target ?? null }) },
    ] },
  water: { title: "Ice signal detected", icon: "💧", text: () => "Our radar spotted buried ice far east of the base!",
    choices: () => [
      { label: "Send the rover", pro: "+30 💧 right away", con: "−20 ⚡", apply: (s) => s.energy < 20 ? "The rover needs 20 energy!" : { ...s, energy: s.energy - 20, water: clamp(s.water + 30, 0, s.capacity) } },
      { label: "Explore it yourself", pro: "Bigger reward (+40 💧) and a discovery", con: "Long walk and suit oxygen to scan it", apply: (s) => ({ ...s, extraSites: [...s.extraSites, "ice2"] }) },
    ] },
  breakthrough: { title: "Scientific breakthrough", icon: "💡", text: () => "Scientists on Earth sent us a clever new idea!",
    choices: (s) => {
      const t = (Object.keys(TECHS) as TechId[]).find((x) => !s.research.includes(x));
      return [
        t ? { label: `Build ${TECHS[t].name}`, pro: `Free upgrade: ${TECHS[t].desc}`, con: "−10 ⚡ to set it up", apply: (x: Sim) => x.energy < 10 ? "Need 10 energy to set it up!" : { ...x, energy: x.energy - 10, research: [...x.research, t] } }
          : { label: "Improve all systems", pro: "+20% life support", con: "None", apply: (x: Sim) => ({ ...x, lifeSupport: clamp(x.lifeSupport + 20) }) },
        { label: "Trade the idea to Earth", pro: "+20 🔩 materials", con: "No upgrade", apply: (x: Sim) => ({ ...x, materials: x.materials + 20 }) },
      ];
    } },
  radiation: { title: "Radiation spike", icon: "☢️", text: () => "A sudden burst of solar radiation is hitting the base!",
    choices: (s) => [
      { label: "Everyone to the shelter", pro: "No extra radiation", con: "−10 ⚡ −5 🥕 (work stops)", apply: (x) => ({ ...x, energy: clamp(x.energy - 10), food: clamp(x.food - 5, 0, x.capacity) }) },
      { label: "Keep working", pro: "Lose nothing", con: `+${Math.round(40 * (1 - s.shield / 100))} radiation dose (better shields = less)`, apply: (x) => ({ ...x, exposure: clamp(x.exposure + 40 * (1 - x.shield / 100)) }) },
    ] },
  dustdevil: { title: "Dust devil", icon: "🌪️", text: () => "A spinning dust devil is heading for the solar farm!",
    choices: () => [
      { label: "Fold the panels", pro: "Panels stay clean", con: "−10 ⚡ (no power while folded)", apply: (x) => ({ ...x, energy: clamp(x.energy - 10) }) },
      { label: "Let it pass", pro: "Free", con: "Panels get dusty (30% clean)", apply: (x) => ({ ...x, panels: Math.min(x.panels, 30) }) },
    ] },
};
export function resolveEvent(prev: Sim, i: number): { sim: Sim; msg: string } {
  if (!prev.event) return { sim: prev, msg: "" };
  const ev = EVENTS[prev.event.kind], c = ev.choices(prev)[i];
  if (!c) return { sim: prev, msg: "" };
  const r = c.apply({ ...prev, systems: { ...prev.systems } });
  if (typeof r === "string") return { sim: prev, msg: r };
  const n = { ...r, event: null, eventsHandled: prev.eventsHandled + 1 };
  addLog(n, "🗳️", `Decision: ${c.label} (${c.pro}; ${c.con})`);
  return { sim: n, msg: `${c.label}! ${c.pro}, but ${c.con.charAt(0).toLowerCase() + c.con.slice(1)}.` };
}

// ---------- Achievements ----------
export const ACHIEVEMENTS: { id: string; icon: string; title: string; done: (s: Sim) => boolean }[] = [
  { id: "harvest", icon: "🥕", title: "First harvest", done: (s) => s.foodMade >= 15 },
  { id: "discovery", icon: "🔍", title: "First discovery", done: (s) => s.discoveries.length >= 1 },
  { id: "lifesupport", icon: "🫧", title: "Stable life support", done: (s) => s.lifeSupport >= 95 },
  { id: "shield", icon: "🛡️", title: "Radiation protection upgrade", done: (s) => s.shield > 30 },
  { id: "scientist", icon: "🔬", title: "Lab scientist (study 3 discoveries)", done: (s) => s.reviewed.length >= 3 },
  { id: "crisis", icon: "🧭", title: "Crisis manager (handle 3 events)", done: (s) => s.eventsHandled >= 3 },
  { id: "storm", icon: "🌪️", title: "Storm survivor", done: (s) => s.sol >= 4 && s.condition >= 50 },
  { id: "flare", icon: "☢️", title: "Flare survivor", done: (s) => s.sol >= 6 && s.exposure < 60 },
  { id: "explorer", icon: "🗺️", title: "Mars explorer (8 discoveries)", done: (s) => s.discoveries.length >= 8 },
  { id: "hero", icon: "🏅", title: "Mars hero", done: (s) => s.status === "won" },
];
export function checkAchievements(s: Sim): { sim: Sim; unlocked: typeof ACHIEVEMENTS } {
  const unlocked = ACHIEVEMENTS.filter((a) => !s.achievements.includes(a.id) && a.done(s));
  if (!unlocked.length) return { sim: s, unlocked };
  const n = { ...s, achievements: [...s.achievements, ...unlocked.map((a) => a.id)] };
  for (const a of unlocked) addLog(n, "⭐", `Achievement: ${a.title}`);
  return { sim: n, unlocked };
}
