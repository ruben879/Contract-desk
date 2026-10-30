// Find which text-layer items on a PDF page hold an extracted value, so the viewer can
// highlight them. Matching ignores spacing, case, and punctuation, because PDF text layers
// split words unpredictably ("$ 315,000.00" may be three items).

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function locate(items: string[], needle: string): number[] | null {
  const n = norm(needle);
  if (n.length < 3) return null;
  let hay = "";
  const owner: number[] = [];
  items.forEach((t, i) => {
    const x = norm(t);
    hay += x;
    for (let k = 0; k < x.length; k++) owner.push(i);
  });
  const at = hay.indexOf(n);
  if (at < 0) return null;
  const hit = owner.slice(at, at + n.length);
  const first = hit[0], last = hit[hit.length - 1];
  return Array.from({ length: last - first + 1 }, (_, k) => first + k); // include punctuation-only items in between
}

/** Variants of a value as it might be printed: 315000 -> "315,000", "315,000.00". */
export function valueVariants(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (typeof v === "number") {
    const whole = v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    const cents = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return [cents, whole];
  }
  if (Array.isArray(v)) return v.map(String);
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const long = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    const short = `${+m[2]}/${+m[3]}/${m[1]}`;
    const shortYY = `${+m[2]}/${+m[3]}/${m[1].slice(2)}`;
    const monthDay = d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
    return [long, short, shortYY, monthDay];
  }
  return [s];
}

/**
 * Returns the indices of the text items to highlight, trying the verbatim quote first,
 * then the value as it might be printed, then the quote's longest run of words.
 */
export function matchItems(items: string[], quote: string | null | undefined, value?: unknown): number[] | null {
  if (quote) {
    const hit = locate(items, quote);
    if (hit) return hit;
  }
  for (const v of valueVariants(value)) {
    const hit = locate(items, v);
    if (hit) return hit;
  }
  if (quote) {
    const words = quote.split(/\s+/).filter(Boolean);
    for (let len = words.length - 1; len >= 2; len--) {
      for (let i = 0; i + len <= words.length; i++) {
        const hit = locate(items, words.slice(i, i + len).join(" "));
        if (hit) return hit;
      }
    }
  }
  return null;
}
