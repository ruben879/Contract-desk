// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildChecklist } from "@/lib/checklist/rules";
import { buildToday, type TodayDeal } from "@/lib/today";

vi.mock("@/app/actions", () => ({ setChecklistStatus: async () => {}, startAddDocuments: async () => {} }));
vi.mock("@/lib/supabase/browser", () => ({ supabaseBrowser: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/" }));

const terms = { side: "buyer", addenda: ["hoa"], financing_type: "cash", seller_disclosure: "received", missing_docs: ["sellers_disclosure", "lead_based_paint", "non_realty_items"] } as any;
const brookhollow: TodayDeal = {
  id: "b", address: "4512 Brookhollow Dr, Lubbock",
  items: buildChecklist(terms).map((i, n) => ({ id: `i${n}`, rule_key: i.rule_key, title: i.title, status: i.status, deadline_key: i.deadline_key, sort: i.sort })),
  deadlines: [
    { key: "earnest_money", label: "Earnest money and option fee due", due_date: "2026-10-06" },
    { key: "option_end", label: "Option period ends", due_date: "2026-10-13" },
    { key: "title_commitment", label: "Title commitment due", due_date: "2026-10-23" },
    { key: "hoa_info", label: "HOA subdivision information due", due_date: "2026-10-23" },
    { key: "closing", label: "Closing", due_date: "2026-11-11" },
  ],
};
const oak: TodayDeal = { id: "o", address: "12 Oak Ln, Lubbock", deadlines: [{ key: "closing", label: "Closing", due_date: "2026-11-20" }],
  items: [{ id: "x", rule_key: "closed", title: "Closed and funded", status: "open", deadline_key: "closing", sort: 1 }] };

async function render(deals: TodayDeal[]) {
  const { TodayBoard } = await import("@/components/TodayBoard");
  const { row, stacks } = buildToday(deals, "2026-11-01");
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(createElement(TodayBoard, { row, stacks })), "text/html");
  return doc;
}
// Join visible text pieces with a space so adjacent blocks don't run together.
const text = (el: Element | null): string => {
  const out: string[] = [];
  const walk = (n: Node) => { if (n.nodeType === 3) out.push(n.textContent ?? ""); else n.childNodes.forEach(walk); };
  if (el) walk(el);
  return out.join(" ").replace(/\s+/g, " ").trim();
};

describe("Today page markup", () => {
  it("Brookhollow: header, then five one-task cards in order, then 'Open deal to see more'", async () => {
    const doc = await render([brookhollow, oak]);
    const stack = doc.getElementById("deal-b")!;
    const header = stack.children[0];
    expect(header.tagName).toBe("A");
    expect([...header.children[0].children].map((n) => n.textContent)).toEqual(["4512 Brookhollow Dr, Lubbock", "Late since Oct 6"]);
    expect(header.getAttribute("href")).toBe("/t/b");
    const cards = [...stack.querySelectorAll("ol > li")].map(text);
    expect(cards).toEqual([
      "Send executed contract to title company 26 days late (due Oct 6) Mark done",
      "Earnest money and option fee delivered, receipt from title in the file 26 days late (due Oct 6) Mark done",
      "Schedule inspections 19 days late (due Oct 13) Mark done",
      "Option period decision: proceed, amend, or terminate 19 days late (due Oct 13) Mark done",
      "Title commitment received and reviewed 9 days late (due Oct 23) Mark done",
      "Open deal to see more",
    ]);
  });
  it("every deal renders as its own stack, in the preview strip's order; nothing is selected", async () => {
    const doc = await render([oak, brookhollow]);
    const stacks = [...doc.querySelectorAll("section[id^=deal-]")].map((s) => s.id);
    const previews = [...doc.querySelectorAll('nav[aria-label="Jump to a deal"] a')].map((a) => a.getAttribute("href"));
    expect(stacks).toEqual(["deal-b", "deal-o"]);
    expect(previews).toEqual(["#deal-b", "#deal-o"]);
    expect(doc.querySelector("[aria-selected], [role=tab]")).toBeNull();
  });
  it("one button per task card; headers and previews never carry one", async () => {
    const doc = await render([brookhollow, oak]);
    for (const li of doc.querySelectorAll("section ol > li")) expect(li.querySelectorAll("button").length).toBeLessThanOrEqual(1);
    for (const s of doc.querySelectorAll("section")) expect(s.children[0].querySelector("button")).toBeNull();
    expect(doc.querySelector('nav[aria-label="Jump to a deal"] button')).toBeNull();
  });
});
