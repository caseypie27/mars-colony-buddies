export const DONKI_TYPES = ["CME", "FLR", "SEP"] as const;
export type DonkiType = (typeof DONKI_TYPES)[number];
export type DonkiDays = 7 | 30;
export interface DonkiEvent {
  id: string;
  time: string | null;
  endTime: string | null;
  peakTime: string | null;
  classification: string | null;
  location: string | null;
  instruments: string[];
  linkedEvents: string[];
  analyses: { speed: number | null; halfAngle: number | null; fullWidth: number | null; mostAccurate: boolean }[];
}
export interface DonkiResult {
  type: DonkiType;
  events: DonkiEvent[];
  startDate: string;
  endDate: string;
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
  retryAt: string;
}
export function utcRange(days: DonkiDays, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}