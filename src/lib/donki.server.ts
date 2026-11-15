import { utcRange, type DonkiDays, type DonkiEvent, type DonkiResult, type DonkiType } from "./donki";

const CACHE_MS = 15 * 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;
type Entry = { result?: DonkiResult; next: number; failures: number; pending?: Promise<DonkiResult> };
const cache = new Map<string, Entry>();
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;

// Allowlist fields; never return upstream URLs, request headers or arbitrary response bodies.
export function normalizeEvents(body: unknown, type: DonkiType, key: string): DonkiEvent[] {
  if (!Array.isArray(body)) throw new Error("Invalid NASA JSON");
  const text = (v: unknown) => typeof v === "string" && !v.includes(key) ? v : null;
  const idField = type === "CME" ? "activityID" : type === "FLR" ? "flrID" : "sepID";
  return body.map((v) => {
    const r = object(v), id = text(r[idField]);
    if (!id) throw new Error("Invalid NASA event");
    return {
      id, time: text(r["startTime"] ?? r["eventTime"]), endTime: text(r["endTime"]), peakTime: text(r["peakTime"]),
      classification: text(r["classType"]), location: text(r["sourceLocation"]),
      instruments: list(r["instruments"]).flatMap((i) => { const name = text(object(i)["displayName"]); return name ? [name] : []; }),
      linkedEvents: list(r["linkedEvents"]).flatMap((i) => { const id = text(object(i)["activityID"]); return id ? [id] : []; }),
      analyses: list(r["cmeAnalyses"]).map((v) => { const a = object(v), halfAngle = number(a["halfAngle"]); return { speed: number(a["speed"]), halfAngle, fullWidth: halfAngle === null ? null : halfAngle * 2, mostAccurate: a["isMostAccurate"] === true }; }),
    };
  }).sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
}

export async function fetchDonki(type: DonkiType, days: DonkiDays, key: string | undefined, fetcher: typeof fetch = fetch, now = new Date()): Promise<DonkiResult> {
  const range = utcRange(days, now), cacheKey = `${type}:${days}`, time = now.getTime();
  let entry = cache.get(cacheKey);
  if (!entry) { entry = { next: 0, failures: 0 }; cache.set(cacheKey, entry); }
  if (entry.pending) return entry.pending;
  if (entry.result && time < entry.next && (entry.result.endDate === range.endDate || entry.result.stale)) return entry.result;
  const current = entry;
  const pending = (async (): Promise<DonkiResult> => {
    try {
      if (!key) throw new Error("Missing configuration");
      const url = new URL(`https://api.nasa.gov/DONKI/${type}`);
      url.searchParams.set("startDate", range.startDate);
      url.searchParams.set("endDate", range.endDate);
      url.searchParams.set("api_key", key);
      const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
      if (!response.ok) throw new Error("NASA unavailable");
      const events = normalizeEvents(await response.json(), type, key);
      current.failures = 0; current.next = time + CACHE_MS;
      return current.result = { type, ...range, events, updatedAt: now.toISOString(), stale: false, error: null, retryAt: new Date(current.next).toISOString() };
    } catch {
      // No raw exceptions/URLs logged: fetch errors can contain the secret-bearing URL.
      current.failures++; current.next = time + Math.min(CACHE_MS, RETRY_MS * 2 ** Math.min(current.failures - 1, 3));
      return current.result = { type, ...(current.result ? { startDate: current.result.startDate, endDate: current.result.endDate } : range), events: current.result?.events ?? [], updatedAt: current.result?.updatedAt ?? null, stale: true, error: key ? `NASA ${type} is temporarily unavailable. Retrying automatically.` : "NASA connection is not configured on the server.", retryAt: new Date(current.next).toISOString() };
    } finally { delete current.pending; }
  })();
  current.pending = pending;
  return pending;
}