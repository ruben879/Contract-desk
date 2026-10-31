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

export type TaskGroup = "late" | "today" | "week" | "later" | "anytime" | "done";
export const GROUP_LABEL: Record<TaskGroup, string> = {
  late: "Past due", today: "Due today", week: "This week", later: "Coming up", anytime: "Anytime", done: "Done",
};

export function taskTiming(status: string, due: ISODate | null | undefined, today: ISODate): { group: TaskGroup; chip: Chip | null } {
  if (status === "done") return { group: "done", chip: { label: "Done", tone: "good" } };
  if (status === "not_needed") return { group: "done", chip: { label: "Not needed", tone: "neutral" } };
  if (!due) return { group: "anytime", chip: null };
  const n = daysBetween(today, due);
  if (n < 0) return { group: "late", chip: { label: `${-n} day${n === -1 ? "" : "s"} late`, tone: "bad" } };
  if (n === 0) return { group: "today", chip: { label: "Due today", tone: "warn" } };
  if (n <= 7) return { group: "week", chip: { label: n === 1 ? "Tomorrow" : `In ${n} days`, tone: n <= 2 ? "warn" : "neutral" } };
  return { group: "later", chip: { label: `In ${n} days`, tone: "neutral" } };
}
