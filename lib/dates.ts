// Plain calendar-date math on "YYYY-MM-DD" strings. No time zones involved,
// so a date never shifts by a day depending on where the server runs.

export type ISODate = string; // YYYY-MM-DD

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISO(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISO(x);
}

export function isWeekend(d: ISODate): boolean {
  const wd = parseISO(d).getUTCDay();
  return wd === 0 || wd === 6;
}

export function isValidISO(d: unknown): d is ISODate {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return toISO(parseISO(d)) === d;
}

export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return "";
  return parseISO(d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function formatShort(d: ISODate): string {
  return parseISO(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "p.m." : "a.m.";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Today's date in a given IANA time zone, as YYYY-MM-DD. */
export function todayIn(tz: string): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}
