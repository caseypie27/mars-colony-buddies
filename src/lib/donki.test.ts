import { beforeEach, describe, expect, it, vi } from "vitest";
import { utcRange } from "./donki";

describe("NASA UTC ranges", () => {
  it("uses 30 days before the current UTC date", () => {
    expect(utcRange(30, new Date("2026-11-15T23:59:59Z"))).toEqual({ startDate: "2026-10-16", endDate: "2026-11-15" });
  });
  it("uses 7 days before today across year boundaries", () => {
    expect(utcRange(7, new Date("2027-01-03T00:01:00Z"))).toEqual({ startDate: "2026-12-27", endDate: "2027-01-03" });
  });
  it("updates the end date after UTC midnight", () => {
    expect(utcRange(7, new Date("2026-11-16T00:00:00Z")).endDate).toBe("2026-11-16");
  });
});

describe("independent NASA requests", () => {
  beforeEach(() => vi.resetModules());
  it.each(["CME", "FLR", "SEP"] as const)("validates %s JSON and sends only server-generated dates", async (type) => {
    const { fetchDonki } = await import("./donki.server");
    const key = "unit-test-credential";
    const field = type === "CME" ? "activityID" : type === "FLR" ? "flrID" : "sepID";
    const mock = vi.fn(async (url: unknown) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe(`/DONKI/${type}`);
      expect(u.searchParams.get("startDate")).toBe("2026-10-16");
      expect(u.searchParams.get("endDate")).toBe("2026-11-15");
      expect(u.searchParams.has("api_key")).toBe(true);
      return Response.json([{ [field]: "real-format-id", startTime: "2026-11-14T12:00Z", link: `https://example.invalid/?api_key=${key}`, cmeAnalyses: [{ speed: 500, halfAngle: 30 }] }]);
    });
    const result = await fetchDonki(type, 30, key, mock as typeof fetch, new Date("2026-11-15T12:00Z"));
    expect(result.error).toBeNull();
    expect(result.events[0]?.id).toBe("real-format-id");
    expect(result.events[0]?.analyses[0]?.fullWidth).toBe(60);
    expect(JSON.stringify(result).includes(key)).toBe(false);
  });
  it("preserves successful observations and backs off without affecting other endpoints", async () => {
    const { fetchDonki } = await import("./donki.server");
    const start = new Date("2026-11-15T12:00Z");
    const good = vi.fn(async () => Response.json([{ activityID: "observed", startTime: "2026-11-14T00:00Z" }]));
    const bad = vi.fn(async () => Response.json({ error: "unavailable" }, { status: 503 }));
    await fetchDonki("CME", 30, "test-key", good as typeof fetch, start);
    await fetchDonki("CME", 30, "test-key", good as typeof fetch, start);
    expect(good).toHaveBeenCalledTimes(1);
    const later = new Date(start.getTime() + 16 * 60000);
    const failed = await fetchDonki("CME", 30, "test-key", bad as typeof fetch, later);
    expect(failed.events[0]?.id).toBe("observed");
    expect(failed.stale).toBe(true);
    await fetchDonki("CME", 30, "test-key", bad as typeof fetch, later);
    expect(bad).toHaveBeenCalledTimes(1);
    const flr = await fetchDonki("FLR", 30, "test-key", (async () => Response.json([])) as typeof fetch, later);
    expect(flr.error).toBeNull();
    expect(flr.events).toEqual([]);
  });
  it("rejects invalid NASA JSON instead of inventing records", async () => {
    const { fetchDonki } = await import("./donki.server");
    const result = await fetchDonki("SEP", 7, "test-key", (async () => Response.json({ message: "not an array" })) as typeof fetch);
    expect(result.error).not.toBeNull();
    expect(result.events).toEqual([]);
    expect(result.updatedAt).toBeNull();
  });
});