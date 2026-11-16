import { addMinutes, set } from "date-fns";
import type { BusinessHour } from "./types";

export function at(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return set(day, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
}

/** Gera horários livres para um dia, considerando expediente, intervalo e ocupações. */
export function buildSlots(opts: {
  day: Date;
  hours: BusinessHour | undefined;
  durationMin: number;
  intervalMin: number;
  busy: { starts_at: string; ends_at: string }[];
  now?: Date;
}): Date[] {
  const { day, hours, durationMin, intervalMin, busy } = opts;
  const now = (opts.now ?? new Date()).getTime();
  if (!hours || !hours.is_open) return [];

  const close = at(day, hours.close_time).getTime();
  const bStart = hours.break_start ? at(day, hours.break_start).getTime() : null;
  const bEnd = hours.break_end ? at(day, hours.break_end).getTime() : null;
  const ranges = busy.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);

  const out: Date[] = [];
  for (let t = at(day, hours.open_time); ; t = addMinutes(t, intervalMin)) {
    const s = t.getTime();
    const e = addMinutes(t, durationMin).getTime();
    if (e > close) break;
    if (s <= now) continue;
    if (bStart !== null && bEnd !== null && s < bEnd && e > bStart) continue;
    if (ranges.some(([bs, be]) => s < be && e > bs)) continue;
    out.push(t);
  }
  return out;
}
