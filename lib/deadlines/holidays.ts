import { ISODate, toISO } from "@/lib/dates";

// Holidays used when a deadline "rolls" past a weekend or legal holiday.
// V1 uses US federal holidays. NEEDS VERIFICATION: confirm which holidays count as
// "legal holidays" for TREC contract periods (Texas state holidays differ) and edit here.

function nthWeekday(year: number, month: number, weekday: number, n: number): ISODate {
  const d = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(1 + offset + (n - 1) * 7);
  return toISO(d);
}

function lastWeekday(year: number, month: number, weekday: number): ISODate {
  const d = new Date(Date.UTC(year, month + 1, 0));
  const offset = (d.getUTCDay() - weekday + 7) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return toISO(d);
}

/** Fixed-date holidays move to Friday/Monday when they land on a weekend (federal observance). */
function observed(year: number, month: number, day: number): ISODate {
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCDay() === 6) d.setUTCDate(day - 1);
  if (d.getUTCDay() === 0) d.setUTCDate(day + 1);
  return toISO(d);
}

const cache = new Map<number, Set<ISODate>>();

export function holidaysFor(year: number): Set<ISODate> {
  const hit = cache.get(year);
  if (hit) return hit;
  const set = new Set<ISODate>([
    observed(year, 0, 1),          // New Year's Day
    nthWeekday(year, 0, 1, 3),     // MLK Day
    nthWeekday(year, 1, 1, 3),     // Presidents' Day
    lastWeekday(year, 4, 1),       // Memorial Day
    observed(year, 5, 19),         // Juneteenth
    observed(year, 6, 4),          // Independence Day
    nthWeekday(year, 8, 1, 1),     // Labor Day
    nthWeekday(year, 9, 1, 2),     // Columbus Day
    observed(year, 10, 11),        // Veterans Day
    nthWeekday(year, 10, 4, 4),    // Thanksgiving
    observed(year, 11, 25),        // Christmas
  ]);
  cache.set(year, set);
  return set;
}

export function isHoliday(d: ISODate): boolean {
  return holidaysFor(Number(d.slice(0, 4))).has(d);
}
