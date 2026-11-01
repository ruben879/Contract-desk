// Comment bodies are plain text. A mention is stored as a token, @[m:<member id>], and shown
// with the member's current name, so renaming someone never breaks an old comment.
// Pure, so it's tested and runs on both the server and in the browser.

export const MAX_COMMENT = 4000;
const TOKEN = /@\[m:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

export type CommentPart = { text: string } | { member: string };

/** Body -> text and mention parts, in order. */
export function splitMentions(body: string): CommentPart[] {
  const out: CommentPart[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) });
    out.push({ member: m[1].toLowerCase() });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

/** Unique member ids mentioned in a body. */
export const mentionIds = (body: string) => [...new Set([...body.matchAll(TOKEN)].map((m) => m[1].toLowerCase()))];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What the person typed ("thanks @Sarah Klassen") plus the people they picked from the list
 * -> the stored body with tokens. Only picked names become mentions; typing "@Sarah" by hand
 * without picking stays plain text. Longer names first, so "Sam Ray" wins over "Sam".
 */
export function encodeMentions(text: string, picked: { id: string; name: string }[]): string {
  let out = text;
  for (const p of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    if (!p.name) continue;
    out = out.replace(new RegExp(`@${escape(p.name)}(?![\\w])`, "g"), `@[m:${p.id}]`);
  }
  return out;
}

/**
 * Keep mentions only for members allowed on this deal. Anyone else is turned back into their
 * name as plain text (or "someone" if unknown), so a forged token never notifies anyone.
 */
export function sanitizeMentions(body: string, allowed: Set<string>, nameOf: (id: string) => string | null): string {
  return body.replace(TOKEN, (tok, id: string) => {
    const k = id.toLowerCase();
    return allowed.has(k) ? `@[m:${k}]` : `@${nameOf(k) ?? "someone"}`;
  });
}

/** Plain-text preview, mentions shown as @Name. */
export const plainText = (body: string, nameOf: (id: string) => string | null) =>
  splitMentions(body).map((p) => ("text" in p ? p.text : `@${nameOf(p.member) ?? "someone"}`)).join("");

/** The @word being typed right before the caret, if any. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|\s)@([^\s@]*(?: [^\s@]*)?)$/);
  if (!m) return null;
  const query = m[2];
  if (query.length > 40) return null;
  return { start: caret - query.length - 1, query };
}
