import { daysBetween, formatShort, type ISODate } from "@/lib/dates";

// Plain-language status for a deal and its tasks, readable at a glance. Pure, so it's tested.

type Tone = "brand" | "warn" | "bad" | "good" | "neutral";
export type Chip = { label: string; tone: Tone };

export function dealStatus(input: {
  status: string; today: ISODate;
  deadlines: { key: string; due_date: ISODate }[];
}): Chip & { detail: string | null } {
  const { status, today } = input;
  if (status === "closed") return { label: "Closed", tone: "good", detail: null };
  if (status === "cancelled") return { label: "Cancelled", tone: "neutral", detail: null };
  const d = new Map(input.deadlines.map((x) => [x.key, x.due_date]));
  const option = d.get("option_end"), closing = d.get("closing");
  if (option && option >= today) {
    const n = daysBetween(today, option);
    return { label: "Option period", tone: "warn", detail: n === 0 ? "Ends today" : `Ends ${formatShort(option)}, in ${n} day${n === 1 ? "" : "s"}` };
  }
  if (closing) {
    const n = daysBetween(today, closing);
    if (n === 0) return { label: "Closing today", tone: "good", detail: null };
    if (n < 0) return { label: "Past closing date", tone: "bad", detail: `Closing was ${formatShort(closing)}` };
    return { label: "Under contract", tone: "brand", detail: `Closes ${formatShort(closing)}, in ${n} day${n === 1 ? "" : "s"}` };
  }
  return { label: "Under contract", tone: "brand", detail: null };
}

export type TaskGroup = "late" | "upcoming" | "paper" | "whenever" | "done";
export const GROUP_LABEL: Record<TaskGroup, string> = {
  late: "Late", upcoming: "Coming up", paper: "Waiting on paper", whenever: "Whenever", done: "Done",
};

/**
 * Where a task sits and the one line that says when it's due. Lateness is stated once.
 * unresolved: its date depends on a term the contract leaves blank (it stays flagged, never dated).
 */
export function taskTiming(status: string, due: ISODate | null | undefined, today: ISODate, unresolved = false, paper = false): {
  group: TaskGroup; when: string | null; tone: "bad" | "warn" | "muted";
} {
  if (status === "done") return { group: "done", when: null, tone: "muted" };
  if (status === "not_needed") return { group: "done", when: "Not needed", tone: "muted" };
  // A document the contract refers to but the file doesn't have: resolved by an upload, not a date.
  if (paper && !due) return { group: "paper", when: null, tone: "muted" };
  if (!due && unresolved) return { group: "whenever", when: "No date: the contract leaves it blank", tone: "warn" };
  if (!due) return { group: "whenever", when: null, tone: "muted" };
  const n = daysBetween(today, due);
  const date = formatShort(due);
  if (n < 0) return { group: "late", when: `${-n} day${n === -1 ? "" : "s"} late (due ${date})`, tone: "bad" };
  if (n === 0) return { group: "upcoming", when: "Due today", tone: "warn" };
  if (n === 1) return { group: "upcoming", when: `Due tomorrow, ${date}`, tone: "warn" };
  return { group: "upcoming", when: `Due ${date}`, tone: "muted" };
}
