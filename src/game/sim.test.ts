import { describe, expect, it } from "vitest";
import { act, checkObjective, DAY_SECONDS, newSim, nextSol, tick } from "./sim";

const runDay = (s = newSim()) => { for (let t = 0; t < DAY_SECONDS; t += 0.5) s = tick(s, 0.5); return s; };

describe("survival sim", () => {
  it("campaign is 10 Sols and pauses between Sols", () => {
    let s = runDay();
    expect(s.status).toBe("summary");
    for (let i = 2; i <= 10; i++) { s = nextSol(s); s = { ...s, condition: 100 }; s = runDay(s); }
    expect(s.status).toBe("won");
  });
  it("oxygen falls without the generator", () => {
    const s = runDay({ ...newSim(), systems: { oxygen: false, greenhouse: false, drill: false } });
    expect(s.oxygen).toBeLessThan(80);
  });
  it("no power stops the greenhouse", () => {
    const s = tick({ ...newSim(), energy: 0, panels: 0 }, 1);
    expect(s.unpowered).toContain("greenhouse");
  });
  it("shield upgrade costs 25 materials and 20 energy", () => {
    const { sim } = act(newSim(), "shield");
    expect(sim.materials).toBe(15); expect(sim.energy).toBe(50); expect(sim.shield).toBe(45);
  });
  it("one empty resource does not instantly fail the mission", () => {
    const s = tick({ ...newSim(), food: 0 }, 5);
    expect(s.status).toBe("day");
  });
  it("research costs energy and materials", () => {
    const { sim } = act(newSim(), "tech-panels");
    expect(sim.materials).toBe(25); expect(sim.energy).toBe(50); expect(sim.research).toContain("panels");
  });
  it("storage expansion raises capacity by 30 for 20 materials", () => {
    const { sim } = act(newSim(), "storage");
    expect(sim.capacity).toBe(130); expect(sim.materials).toBe(20);
  });
  it("completing an objective advances and rewards 10 materials", () => {
    const r = checkObjective({ ...newSim(), lifeSupport: 95 });
    expect(r.sim.objective).toBe(1); expect(r.sim.materials).toBe(50);
  });
  it("fast drilling makes more water", () => {
    const base = { ...newSim(), systems: { oxygen: false, greenhouse: false, drill: true } };
    expect(tick({ ...base, drillHigh: true }, 5).water).toBeGreaterThan(tick(base, 5).water);
  });
});
