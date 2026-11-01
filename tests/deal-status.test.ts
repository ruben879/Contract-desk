import { describe, expect, it } from "vitest";
import { dealStatus, taskTiming } from "@/lib/deal-status";

const today = "2026-10-31";
describe("dealStatus", () => {
  const dl = (option: string | null, closing: string | null) =>
    [option && { key: "option_end", due_date: option }, closing && { key: "closing", due_date: closing }].filter(Boolean) as any;
  it("option period while it runs", () => expect(dealStatus({ status: "active", today, deadlines: dl("2026-11-04", "2026-12-04") })).toMatchObject({ label: "Option period", detail: "Ends Nov 4, in 4 days" }));
  it("under contract after it ends", () => expect(dealStatus({ status: "active", today, deadlines: dl("2026-10-20", "2026-12-04") })).toMatchObject({ label: "Under contract", detail: "Closes Dec 4, in 34 days" }));
  it("closing today and past closing", () => {
    expect(dealStatus({ status: "active", today, deadlines: dl(null, today) }).label).toBe("Closing today");
    expect(dealStatus({ status: "active", today, deadlines: dl(null, "2026-10-29") })).toMatchObject({ label: "Past closing date", tone: "bad" });
  });
  it("closed wins", () => expect(dealStatus({ status: "closed", today, deadlines: dl("2026-11-04", null) }).label).toBe("Closed"));
});

describe("taskTiming", () => {
  it("three groups, and lateness stated once", () => {
    expect(taskTiming("open", "2026-10-29", today)).toEqual({ group: "late", when: "2 days late (due Oct 29)", tone: "bad" });
    expect(taskTiming("open", today, today)).toEqual({ group: "upcoming", when: "Due today", tone: "warn" });
    expect(taskTiming("open", "2026-11-01", today).when).toBe("Due tomorrow, Nov 1");
    expect(taskTiming("open", "2026-11-20", today)).toEqual({ group: "upcoming", when: "Due Nov 20", tone: "muted" });
    expect(taskTiming("open", null, today)).toEqual({ group: "whenever", when: null, tone: "muted" });
    expect(taskTiming("not_needed", "2026-10-01", today).group).toBe("done");
  });
});
