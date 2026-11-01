import { describe, expect, it } from "vitest";
import { encodeMentions, mentionIds, mentionQuery, plainText, sanitizeMentions, splitMentions } from "@/lib/comments";

const sarah = { id: "11111111-1111-4111-8111-111111111111", name: "Sarah Klassen" };
const sam = { id: "22222222-2222-4222-8222-222222222222", name: "Sam" };
const samRay = { id: "33333333-3333-4333-8333-333333333333", name: "Sam Ray" };
const names: Record<string, string> = { [sarah.id]: sarah.name, [sam.id]: sam.name, [samRay.id]: samRay.name };
const nameOf = (id: string) => names[id] ?? null;

describe("mentions", () => {
  it("only picked names become mentions", () => {
    const body = encodeMentions("@Sarah Klassen can you get the LBP addendum? cc @Bob", [sarah]);
    expect(body).toBe(`@[m:${sarah.id}] can you get the LBP addendum? cc @Bob`);
    expect(mentionIds(body)).toEqual([sarah.id]);
  });
  it("longer names win over shorter ones that prefix them", () => {
    const body = encodeMentions("@Sam Ray and @Sam", [sam, samRay]);
    expect(mentionIds(body)).toEqual([samRay.id, sam.id]);
  });
  it("renders back to names", () => {
    const body = `Thanks @[m:${sarah.id}]!`;
    expect(splitMentions(body)).toEqual([{ text: "Thanks " }, { member: sarah.id }, { text: "!" }]);
    expect(plainText(body, nameOf)).toBe("Thanks @Sarah Klassen!");
  });
  it("a token for someone not allowed on the deal never notifies them", () => {
    const body = sanitizeMentions(`hi @[m:${sarah.id}] and @[m:${sam.id}]`, new Set([sarah.id]), nameOf);
    expect(mentionIds(body)).toEqual([sarah.id]);
    expect(body).toContain("@Sam");
  });
  it("finds the @word being typed", () => {
    expect(mentionQuery("hey @sar", 8)).toEqual({ start: 4, query: "sar" });
    expect(mentionQuery("hey @sarah k", 12)).toEqual({ start: 4, query: "sarah k" });
    expect(mentionQuery("@Sarah Klassen thanks", 21)).toBeNull();
    expect(mentionQuery("email me at a@b.com", 19)).toBeNull();
  });
});
