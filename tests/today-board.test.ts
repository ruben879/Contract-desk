// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
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
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  await act(async () => { createRoot(host).render(createElement(TodayBoard, { row, stacks })); });
  return host;
}
const text = (el: Element | null): string => {
  const out: string[] = [];
  const walk = (n: Node) => { if (n.nodeType === 3) out.push(n.textContent ?? ""); else n.childNodes.forEach(walk); };
  if (el) walk(el);
  return out.join(" ").replace(/\s+/g, " ").trim();
};
const deckOf = (root: Element, id: string) => root.querySelector(`[data-deck="${id}"]`)!;
const front = (deck: Element) => deck.querySelector("article")!;
const press = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
/** Walk the deck with the forward chevron and read every card, front to back. */
async function walk(deck: Element) {
  const seen: string[] = [];
  for (;;) {
    seen.push(text(front(deck)));
    const next = deck.querySelector('button[aria-label="Next task"]') as HTMLButtonElement | null;
    if (!next || next.disabled) return seen;
    await press(next);
  }
}

const BROOKHOLLOW = [
  "Send executed contract to title company 26 days late (due Oct 6) Mark done",
  "Earnest money and option fee delivered, receipt from title in the file 26 days late (due Oct 6) Mark done",
  "Schedule inspections 19 days late (due Oct 13) Mark done",
  "Option period decision: proceed, amend, or terminate 19 days late (due Oct 13) Mark done",
  "Title commitment received and reviewed 9 days late (due Oct 23) Mark done",
  "Open deal to see more Every task, date, document and person on this deal.",
];

describe("Today: each deal's tasks are a deck", () => {
  it("Brookhollow: header, then a deck with one card showing and the rest stacked behind it", async () => {
    const root = await render([brookhollow, oak]);
    const stack = root.querySelector("#deal-b")!;
    const header = stack.children[0];
    expect(header.tagName).toBe("A");
    expect(header.getAttribute("href")).toBe("/t/b");
    expect([...header.children[0].children].map((n) => n.textContent)).toEqual(["4512 Brookhollow Dr, Lubbock", "Late since Oct 6"]);
    const deck = deckOf(root, "b");
    expect(deck.querySelectorAll("article")).toHaveLength(1);           // not laid out as a list
    expect(deck.querySelectorAll(".pback")).toHaveLength(2);            // edges of the cards behind
    expect(text(deck.querySelector("[data-count]"))).toBe("1 of 6");
    expect(text(front(deck))).toBe(BROOKHOLLOW[0]);                     // most urgent in front
  });
  it("the rest of the deck is in deal-page order, and the last card is 'Open deal to see more'", async () => {
    const deck = deckOf(await render([brookhollow]), "b");
    expect(await walk(deck)).toEqual(BROOKHOLLOW);
    expect(front(deck).getAttribute("data-card")).toBe("open-deal");
    expect(front(deck).querySelector("a")!.getAttribute("href")).toBe("/t/b");
    expect(deck.querySelectorAll(".pback")).toHaveLength(0);
  });
  it("goes back as well as forward", async () => {
    const deck = deckOf(await render([brookhollow]), "b");
    await press(deck.querySelector('button[aria-label="Next task"]'));
    await press(deck.querySelector('button[aria-label="Next task"]'));
    expect(text(front(deck))).toBe(BROOKHOLLOW[2]);
    await press(deck.querySelector('button[aria-label="Previous task"]'));
    expect(text(front(deck))).toBe(BROOKHOLLOW[1]);
  });
  it("Mark done drops that card and the next comes forward", async () => {
    const deck = deckOf(await render([brookhollow]), "b");
    await press(front(deck).querySelector("button"));
    expect(text(front(deck))).toBe(BROOKHOLLOW[1]);
    expect(text(deck.querySelector("[data-count]"))).toBe("1 of 5");
  });
  it("a deck whose tasks are all done is just the 'Open deal to see more' card", async () => {
    const deck = deckOf(await render([oak]), "o");
    await press(front(deck).querySelector("button"));
    expect(deck.querySelectorAll("article")).toHaveLength(1);
    expect(front(deck).getAttribute("data-card")).toBe("open-deal");
    expect(deck.querySelector("[data-count]")).toBeNull();
  });
  it("every deal renders as its own deck, in the preview strip's order; nothing is selected", async () => {
    const root = await render([oak, brookhollow]);
    expect([...root.querySelectorAll("section[id^=deal-]")].map((s) => s.id)).toEqual(["deal-b", "deal-o"]);
    expect([...root.querySelectorAll('nav[aria-label="Jump to a deal"] a')].map((a) => a.getAttribute("href"))).toEqual(["#deal-b", "#deal-o"]);
    expect(root.querySelector("[aria-selected], [role=tab]")).toBeNull();
  });
  it("one button per task card; headers and previews never carry one", async () => {
    const root = await render([brookhollow, oak]);
    for (const a of root.querySelectorAll("article")) expect(a.querySelectorAll("button").length).toBeLessThanOrEqual(1);
    for (const s of root.querySelectorAll("section")) expect(s.children[0].querySelector("button")).toBeNull();
    expect(root.querySelector('nav[aria-label="Jump to a deal"] button')).toBeNull();
  });
});
