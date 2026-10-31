import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Anthropic client: records each request and replays scripted answers.
const calls: any[] = [];
let script: Array<() => any> = [];
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const real: any = await orig();
  class Fake {
    messages = {
      stream: (params: any) => {
        calls.push(params);
        const next = script.shift()!;
        return { finalMessage: async () => next() };
      },
    };
  }
  (Fake as any).APIError = real.default.APIError;
  (Fake as any).APIConnectionError = real.default.APIConnectionError;
  return { ...real, default: Fake };
});

import Anthropic from "@anthropic-ai/sdk";
import { readContract } from "@/lib/extract/read-contract";
import { changesFormat, extractionFormat, triageFormat, extractionFromWire, changesFromWire } from "@/lib/extract/wire";
import { ExtractionSchema, ChangeSchema, FIELD_KEYS } from "@/lib/extract/schema";
import { displayError, friendlyReadError } from "@/lib/extract/errors";
import { proposeChanges } from "@/lib/terms";

// ---------- 1. Schemas obey the structured-output rules ----------
function audit(node: any, path = "$"): string[] {
  const bad: string[] = [];
  if (!node || typeof node !== "object") return bad;
  if (node.anyOf || node.oneOf) bad.push(`${path}: anyOf/oneOf (nullable unions are capped at 16 per request)`);
  if (Array.isArray(node.type)) bad.push(`${path}: type array`);
  for (const k of ["minimum", "maximum", "multipleOf", "minLength", "maxLength", "maxItems"]) if (k in node) bad.push(`${path}: ${k} unsupported`);
  if ("minItems" in node && ![0, 1].includes(node.minItems)) bad.push(`${path}: minItems ${node.minItems}`);
  if (node.enum && node.enum.some((v: unknown) => typeof v === "object")) bad.push(`${path}: complex enum`);
  if (node.type === "object") {
    if (node.additionalProperties !== false) bad.push(`${path}: additionalProperties must be false`);
    const keys = Object.keys(node.properties ?? {});
    const missing = keys.filter((k) => !(node.required ?? []).includes(k));
    if (missing.length) bad.push(`${path}: optional properties ${missing.join(",")}`);
    for (const k of keys) bad.push(...audit(node.properties[k], `${path}.${k}`));
  }
  if (node.items) bad.push(...audit(node.items, `${path}[]`));
  return bad;
}

describe("structured-output schemas", () => {
  for (const [name, f] of Object.entries({ extractionFormat, changesFormat, triageFormat })) {
    it(`${name} follows every rule`, () => {
      expect(f.type).toBe("json_schema");
      expect(audit(f.schema)).toEqual([]);
    });
  }
});

// The grammar ceiling isn't documented, so the guard is structural: every schema stays far below
// the one the API refused on Oct 31 (319 properties, 152 enum values, 39 arrays).
function weigh(n: any) {
  const w = { props: 0, enums: 0, arrays: 0 };
  const walk = (x: any) => {
    if (!x || typeof x !== "object") return;
    if (x.properties) { w.props += Object.keys(x.properties).length; Object.values(x.properties).forEach(walk); }
    if (x.enum) w.enums += x.enum.length;
    if (x.items) { w.arrays++; walk(x.items); }
  };
  walk(n);
  return w;
}
describe("schema size stays far below the refused one", () => {
  for (const [name, f] of Object.entries({ extractionFormat, changesFormat, triageFormat })) {
    it(name, () => {
      const w = weigh(f.schema);
      expect(w.props).toBeLessThanOrEqual(40);   // refused: 319
      expect(w.enums).toBeLessThanOrEqual(100);  // refused: 152
      expect(w.arrays).toBeLessThanOrEqual(8);   // refused: 39
    });
  }
  it("adding contract fields doesn't grow the extraction grammar's structure", () => {
    expect(weigh(extractionFormat.schema).props).toBeLessThan(30);
  });
});

// ---------- 2. Converters ----------
const loc = { doc: 1, page: 2, quote: "$ 325,000.00", box: [0.6, 0.3, 0.8, 0.33], source: "Para 3C" };
const none = { doc: 0, page: 0, quote: "", box: [], source: "" };
function wireAnswer() {
  return {
    fields: [
      { field: "sales_price", value: "$325,000.00", confidence: "medium", ...none },
      { field: "sales_price", value: "325000", confidence: "high", ...loc }, // duplicate: higher confidence wins
      { field: "buyers", value: "Jordan Avery", confidence: "high", ...loc },
      { field: "financing_type", value: "Conventional", confidence: "medium", ...loc }, // enum casing
      { field: "property_street", value: "", confidence: "low", ...none }, // empty = not found
      { field: "not_a_field", value: "x", confidence: "high", ...none }, // ignored
    ],
    addenda: [{ key: "third_party_financing", name: "TPF", form_number: "", doc: 1, page: 0, evidence: "attached" }],
    documents: [{ doc: 1, kind: "contract", name: "Contract", slot: "contract" }, { doc: 2, kind: "other", name: "x", slot: "none" }],
    warnings: ["Effective date is blank"],
  };
}

describe("wire to app shape", () => {
  it("restores nulls and keeps found values", () => {
    const x = ExtractionSchema.parse(extractionFromWire(wireAnswer()));
    expect(x.sales_price).toMatchObject({ value: 325000, confidence: "high", page: 2, source: "Para 3C", box: [0.6, 0.3, 0.8, 0.33] });
    expect(x.financing_type.value).toBe("conventional");
    expect(x.effective_date).toMatchObject({ value: null, page: null, quote: null, box: null, source: null }); // never mentioned
    expect(x.property_street.value).toBeNull();
    expect(x.buyers.value).toEqual(["Jordan Avery"]);
    expect(x.addenda[0]).toMatchObject({ form_number: null, page: null, doc: 1 });
    expect(x.documents[1].slot).toBeNull();
  });
  it("change values become proposals of the right type", () => {
    const c = ChangeSchema.parse(changesFromWire({
      changes: [
        { key: "sales_price", value_text: "$312,000", confidence: "high", ...loc },
        { key: "closing_date", value_text: "2026-12-11", confidence: "high", ...loc },
        { key: "buyers", value_text: "Jordan Avery; Sam Avery", confidence: "medium", ...none },
      ],
      addenda_added: [], addenda_removed: [], documents: [], summary: "s", warnings: [],
    }));
    const current: any = { sales_price: 325000, closing_date: "2026-12-04", buyers: null, addenda: [] };
    const { proposed } = proposeChanges(current, c.changes as any);
    expect(proposed.map((p) => [p.key, p.after])).toEqual([["sales_price", 312000], ["closing_date", "2026-12-11"]]);
    expect(c.changes[2].value).toEqual(["Jordan Avery", "Sam Avery"]);
  });
});

// ---------- 3. The reader call ----------
const msg = (text: string, stop = "end_turn") => ({ stop_reason: stop, content: [{ type: "text", text }] });
const pdf = [{ name: "contract.pdf", base64: "JVBERi0=", isScanned: false }];

describe("reader request", () => {
  beforeEach(() => { calls.length = 0; script = []; });

  it("uses structured output and never forces a tool", async () => {
    script = [() => msg(JSON.stringify(wireAnswer()))];
    const { extraction } = await readContract(pdf);
    expect(extraction.sales_price.value).toBe(325000);
    expect(calls[0].output_config.format.type).toBe("json_schema");
    expect(calls[0].tool_choice).toBeUndefined();
    expect(calls[0].tools).toBeUndefined();
  });

  it("retries with more room when the answer is cut off", async () => {
    script = [() => msg('{"sales_price":', "max_tokens"), () => msg(JSON.stringify(wireAnswer()))];
    await readContract(pdf);
    expect(calls.map((c) => c.max_tokens)).toEqual([16000, 32000]);
  });

  it("retries once on an unusable answer, then gives a plain error", async () => {
    script = [() => msg("Sorry, here is a summary instead."), () => msg("still not json")];
    const err = await readContract(pdf).catch((e) => e);
    expect(calls).toHaveLength(2);
    expect(friendlyReadError(err).message).toBe("The contract reader gave an answer we couldn't use. Try again.");
  });

  it("turns an API error into a plain sentence, with the detail kept for the log", async () => {
    const apiErr = new (Anthropic as any).APIError(400, { type: "error", error: { type: "invalid_request_error", message: "bad" } }, "400 bad", new Headers());
    script = [() => { throw apiErr; }];
    const err = await readContract(pdf).catch((e) => e);
    const f = friendlyReadError(err);
    expect(f.message).not.toMatch(/[{}]|invalid_request_error|400/);
    expect(f.detail).toContain("400");
  });
});

describe("when the API refuses the schema", () => {
  beforeEach(() => { calls.length = 0; script = []; });
  it("reads again without a grammar and validates the plain JSON answer", async () => {
    const refused = new (Anthropic as any).APIError(400, { type: "error", error: { type: "invalid_request_error", message: GRAMMAR } }, `400 ${GRAMMAR}`, new Headers());
    script = [() => { throw refused; }, () => msg("```json\n" + JSON.stringify(wireAnswer()) + "\n```")];
    const { extraction } = await readContract(pdf);
    expect(extraction.sales_price.value).toBe(325000);
    expect(calls[0].output_config).toBeDefined();
    expect(calls[1].output_config).toBeUndefined();
    expect(calls[1].system).toContain("matching this JSON schema");
  });
});

const GRAMMAR = "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.";
describe("error wording matches the real cause", () => {
  const api = (status: number, message: string) =>
    new (Anthropic as any).APIError(status, { type: "error", error: { type: "invalid_request_error", message } }, `${status} ${message}`, new Headers());
  it("a grammar error is never presented as a file problem (Oct 31)", () => {
    const m = friendlyReadError(api(400, GRAMMAR)).message;
    expect(m).not.toMatch(/too big|split|pages/i);
    expect(m).toContain("couldn't process this file");
  });
  it("real size and page errors still say so", () => {
    expect(friendlyReadError(api(413, "Request too large")).message).toMatch(/too big/);
    expect(friendlyReadError(api(400, "A maximum of 100 PDF pages may be provided.")).message).toMatch(/too many pages/);
  });
});

// ---------- 4. Saved messages from before this fix ----------
describe("displayError", () => {
  it("hides the raw API response from Oct 31", () => {
    const saved = `400 {"type":"error","error":{"type":"invalid_request_error","message":"tool_choice type \\"tool\\" and \\"any\\" are not supported for this model."},"request_id":"req_011Cgb5DgJfQwATZfi7gz3u"}`;
    expect(displayError(saved)).toBe("Something went wrong reading this file. Try again; if it keeps failing, your broker has the details.");
  });
  it("keeps plain sentences", () => expect(displayError("This PDF is password-protected. Save an unlocked copy and add that.")).toContain("password"));
});
