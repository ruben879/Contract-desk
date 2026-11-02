import { addDays, formatShort, ISODate, isValidISO, isWeekend } from "@/lib/dates";
import { isHoliday } from "./holidays";

// Deadlines are a chain. Each rule anchors to a contract date (effective or closing) or to
// another deadline, so moving one date moves everything downstream of it. This file is pure
// and runs both on the server (when saving) and in the browser (live preview before confirm).

export const CONTRACT_ANCHORS = { effective_date: "Effective date", closing_date: "Closing date" } as const;

export type DeadlineRule = {
  key: string;
  label: string;
  contract_ref: string;
  anchor: string;                 // 'effective_date' | 'closing_date' | another rule's key
  default_days: number | null;    // may be negative, e.g. -3 = three days before the anchor
  use_contract_days: boolean;
  due_time: string | null;
  roll_weekends_holidays: boolean;
  needs_verification: boolean;
  sort: number;
};

export type DealDates = {
  effective_date: ISODate | null;
  closing_date: ISODate | null;
  option_period_days: number | null;
  survey_days: number | null;
  hoa_info_days?: number | null;   // HOA addendum, Para A
  fin_approval_days?: number | null; // Third Party Financing Addendum, Para 2A (buyer approval)
  addenda?: readonly string[];     // confirmed addenda; rules that need one (HOA) apply only when it's there
};

export type ComputedDeadline = {
  key: string;
  label: string;
  due_date: ISODate;
  due_time: string | null;
  contract_ref: string;
  calculation: string;
  needs_verification: boolean;
  anchor: string;
  anchor_date: ISODate;
};

/**
 * unresolved: the contract leaves the term blank, so there is no date to give it (needs attention).
 * waiting:    an anchor it counts from is missing.
 * setup:      a Settings problem (loop, unknown anchor, no day count).
 */
export type SkippedDeadline = { key: string; label: string; reason: string; kind: "unresolved" | "waiting" | "setup" };

/** Deadlines whose day count is written in the contract. Blank in the contract means no date, never a default. */
const CONTRACT_DAYS: Record<string, (d: DealDates) => number | null | undefined> = {
  option_end: (d) => d.option_period_days,
  survey: (d) => d.survey_days,
  hoa_info: (d) => d.hoa_info_days,
  fin_approval: (d) => d.fin_approval_days,
};

/** Rules whose day count comes only from the contract when "use contract days" is on. */
export const CONTRACT_DAY_KEYS = Object.keys(CONTRACT_DAYS);

/** Deadlines that exist only when an addendum is in the file. */
export const DEADLINE_REQUIRES: Record<string, string> = { hoa_info: "hoa", fin_approval: "third_party_financing" };

const paraOf = (ref: string) => ref.match(/Para(?:graph)?\.?\s*[\w.]+/i)?.[0] ?? ref;

export function rollForward(d: ISODate): { date: ISODate; rolled: boolean } {
  let cur = d;
  let rolled = false;
  while (isWeekend(cur) || isHoliday(cur)) {
    cur = addDays(cur, 1);
    rolled = true;
  }
  return { date: cur, rolled };
}

/** Returns the keys forming a cycle, or null. Used to reject bad settings before saving. */
export function findCycle(rules: Pick<DeadlineRule, "key" | "anchor">[]): string[] | null {
  const byKey = new Map(rules.map((r) => [r.key, r]));
  for (const start of rules) {
    const seen: string[] = [];
    let cur: string | undefined = start.key;
    while (cur && byKey.has(cur)) {
      if (seen.includes(cur)) return seen.slice(seen.indexOf(cur));
      seen.push(cur);
      cur = byKey.get(cur)!.anchor;
    }
  }
  return null;
}

export function computeDeadlines(rules: DeadlineRule[], deal: DealDates) {
  const byKey = new Map(rules.map((r) => [r.key, r]));
  const done = new Map<string, ComputedDeadline>();
  const skipped = new Map<string, SkippedDeadline>();
  const notApplicable = new Set<string>();
  const visiting = new Set<string>();

  const labelOf = (anchor: string) =>
    (CONTRACT_ANCHORS as Record<string, string>)[anchor] ?? byKey.get(anchor)?.label ?? anchor;

  function resolve(rule: DeadlineRule): ComputedDeadline | null {
    if (done.has(rule.key)) return done.get(rule.key)!;
    if (skipped.has(rule.key) || notApplicable.has(rule.key)) return null;
    const skip = (reason: string, kind: SkippedDeadline["kind"] = "setup") => { skipped.set(rule.key, { key: rule.key, label: rule.label, reason, kind }); return null; };
    const needs = DEADLINE_REQUIRES[rule.key];
    if (needs && !(deal.addenda ?? []).includes(needs)) { notApplicable.add(rule.key); return null; }
    if (visiting.has(rule.key)) return skip("Its anchor loops back to itself. Fix it in Settings.");
    visiting.add(rule.key);

    let anchorDate: ISODate | null = null;
    if (rule.anchor === "effective_date" || rule.anchor === "closing_date") {
      anchorDate = deal[rule.anchor];
      if (!isValidISO(anchorDate)) { visiting.delete(rule.key); return skip(`${labelOf(rule.anchor)} is missing`, "waiting"); }
    } else {
      const parent = byKey.get(rule.anchor);
      if (!parent) { visiting.delete(rule.key); return skip(`Anchor "${rule.anchor}" doesn't exist`); }
      const p = resolve(parent);
      if (!p) { visiting.delete(rule.key); return skip(notApplicable.has(parent.key) ? `${parent.label} doesn't apply to this deal` : `Waiting on ${parent.label}`, "waiting"); }
      anchorDate = p.due_date;
    }

    const fromContractTerm = rule.use_contract_days && rule.key in CONTRACT_DAYS;
    const fromContract = fromContractTerm ? CONTRACT_DAYS[rule.key](deal) ?? null : null;
    // The contract leaves this term blank: flag it, never fill in a default it doesn't have.
    if (fromContractTerm && fromContract == null) {
      visiting.delete(rule.key);
      return skip(`The contract leaves this blank (${paraOf(rule.contract_ref)}).`, "unresolved");
    }
    const days = fromContract ?? rule.default_days;
    if (days == null) { visiting.delete(rule.key); return skip("No day count in the contract and no default set"); }

    const raw = addDays(anchorDate!, days);
    const { date, rolled } = rule.roll_weekends_holidays ? rollForward(raw) : { date: raw, rolled: false };

    const name = labelOf(rule.anchor);
    const parts: string[] = [];
    if (days === 0) parts.push(`${name} ${formatShort(anchorDate!)}`);
    else {
      const source = fromContract != null ? "per contract" : rule.needs_verification ? "placeholder" : "default";
      parts.push(`${name} ${formatShort(anchorDate!)} ${days > 0 ? "+" : "-"} ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} (${source})`);
    }
    if (rolled) parts.push(`moved from ${formatShort(raw)} past a weekend or holiday`);

    const out: ComputedDeadline = {
      key: rule.key, label: rule.label, due_date: date, due_time: rule.due_time, contract_ref: rule.contract_ref,
      calculation: parts.join(", "), needs_verification: rule.needs_verification, anchor: rule.anchor, anchor_date: anchorDate!,
    };
    visiting.delete(rule.key);
    done.set(rule.key, out);
    return out;
  }

  const ordered = [...rules].sort((a, b) => a.sort - b.sort);
  ordered.forEach(resolve);
  return {
    deadlines: ordered.map((r) => done.get(r.key)).filter((d): d is ComputedDeadline => !!d),
    skipped: ordered.map((r) => skipped.get(r.key)).filter((s): s is SkippedDeadline => !!s),
  };
}

export type DeadlineShift = {
  key: string;
  label: string;
  before: { due_date: ISODate; due_time: string | null } | null;
  after: { due_date: ISODate; due_time: string | null } | null;
  change: "moved" | "added" | "removed" | "same";
};

/** What the agent sees before confirming: which dates move, appear, or drop off. */
export function diffDeadlines(
  before: { key: string; label: string; due_date: ISODate; due_time: string | null }[],
  after: { key: string; label: string; due_date: ISODate; due_time: string | null }[],
): DeadlineShift[] {
  const a = new Map(after.map((d) => [d.key, d]));
  const b = new Map(before.map((d) => [d.key, d]));
  const keys = [...new Set([...after.map((d) => d.key), ...before.map((d) => d.key)])];
  return keys.map((key) => {
    const x = b.get(key), y = a.get(key);
    const change = !x ? "added" : !y ? "removed"
      : x.due_date !== y.due_date || (x.due_time ?? null) !== (y.due_time ?? null) ? "moved" : "same";
    return {
      key, label: (y ?? x)!.label, change,
      before: x ? { due_date: x.due_date, due_time: x.due_time ?? null } : null,
      after: y ? { due_date: y.due_date, due_time: y.due_time ?? null } : null,
    };
  });
}
