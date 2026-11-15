import { useState } from "react";
import { queryOptions, useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DONKI_TYPES, type DonkiDays, type DonkiResult, type DonkiType } from "@/lib/donki";
import { getDonki } from "@/lib/donki.functions";

const displayTime = (value: string | null) => value ? `${value.replace("T", " ").replace("Z", "")} UTC` : "Not reported";

export function SolarWatch() {
  const [tab, setTab] = useState<DonkiType>("CME");
  const [days, setDays] = useState<DonkiDays>(30);
  const read = useServerFn(getDonki);
  const queries = useQueries({ queries: DONKI_TYPES.map((type) => queryOptions({
    queryKey: ["nasa-donki", type, days],
    queryFn: async (): Promise<DonkiResult> => read({ data: { type, days } }),
    staleTime: 120000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    retryDelay: 120000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => Math.max(120000, new Date(query.state.data?.retryAt ?? Date.now() + 120000).getTime() - Date.now()),
    structuralSharing: (old: unknown, value: unknown) => {
      const next = value as DonkiResult;
      const previous = old as DonkiResult | undefined;
      return next.stale && !next.updatedAt && previous?.updatedAt ? { ...previous, stale: true, error: next.error, retryAt: next.retryAt } : next;
    },
  })) });
  const selected = queries[DONKI_TYPES.indexOf(tab)];
  if (!selected) return null;
  const result = selected.data;
  return (
    <section aria-label="Solar Watch Station" className="text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="NASA events" className="flex gap-1">
          {DONKI_TYPES.map((type, i) => <Button key={type} size="sm" role="tab" aria-selected={tab === type} onClick={() => setTab(type)} variant={tab === type ? "default" : "ghost"}>
            {type}{queries[i]?.isPending ? <LoaderCircle className="animate-spin" aria-label="Loading" /> : <span aria-label={queries[i]?.data?.error || queries[i]?.isError ? "Unavailable" : "Connected"}>{queries[i]?.data?.error || queries[i]?.isError ? "!" : "✓"}</span>}
          </Button>)}
        </div>
        <div role="group" aria-label="Date range" className="flex gap-1">
          {([7, 30] as const).map((d) => <Button key={d} size="sm" aria-pressed={days === d} variant={days === d ? "default" : "ghost"} onClick={() => setDays(d)}>{d} days</Button>)}
        </div>
      </div>
      <div role="tabpanel" aria-label={`${tab} events`}>
        {selected.isPending && <p role="status" className="flex items-center gap-2"><LoaderCircle className="animate-spin" />Loading NASA {tab}…</p>}
        {selected.isError && <p role="alert" className="text-destructive">Connection interrupted. Retrying automatically; saved observations remain below.</p>}
        {result?.error && <p role="alert" className="mb-2 text-destructive">{result.error}</p>}
        {result && <div className="mb-3 text-xs leading-relaxed text-hud-muted">
          <div>{result.startDate} – {result.endDate} · UTC</div>
          <div>Last updated: {displayTime(result.updatedAt)}{result.stale && result.updatedAt ? " · Saved observations" : ""}{selected.isFetching && !selected.isPending ? " · Updating…" : ""}</div>
        </div>}
        {result?.updatedAt && result.events.length === 0 && <p>No NASA {tab} events reported in this period.</p>}
        <ul className="space-y-3">
          {result?.events.map((e) => <li key={e.id} className="border-t border-hud-fg/15 pt-2">
            <div className="break-words font-bold text-accent">{tab === "FLR" ? `${e.classification ?? "Unclassified"} solar flare` : tab === "CME" ? "Coronal mass ejection" : "Solar energetic particle event"}</div>
            <div>{displayTime(e.time)}</div>
            <div className="break-all text-xs text-hud-muted">{e.id}</div>
            {e.analyses.map((a, i) => <div key={i} className="mt-1">{a.mostAccurate ? "Preferred analysis · " : "Analysis · "}Speed: {a.speed === null ? "Not reported" : `${a.speed} km/s`}<br />Angular width: {a.fullWidth === null ? "Not reported" : `${a.fullWidth}° (half-angle ${a.halfAngle}°)`}</div>)}
            {tab === "CME" && !e.analyses.length && <div className="text-hud-muted">Speed / angular width: not reported</div>}
            {e.peakTime && <div>Peak: {displayTime(e.peakTime)}</div>}
            {e.endTime && <div>End: {displayTime(e.endTime)}</div>}
            {e.location && <div>Source: {e.location}</div>}
            {e.instruments.length > 0 && <div className="break-words">Instruments: {e.instruments.join(", ")}</div>}
            {e.linkedEvents.length > 0 && <div className="break-words text-xs text-hud-muted">Related: {e.linkedEvents.join(", ")}</div>}
          </li>)}
        </ul>
      </div>
    </section>
  );
}