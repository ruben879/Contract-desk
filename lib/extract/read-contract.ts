import Anthropic from "@anthropic-ai/sdk";
import { ChangeSchema, ExtractionSchema, TriageSchema, type ChangeResult, type Extraction, type Triage } from "./schema";
import { changesFormat, changesFromWire, extractionFormat, extractionFromWire, FIELD_GUIDE, triageFormat, triageFromWire } from "./wire";
import { ReaderError } from "./errors";
import { SLOT_GUIDE } from "@/lib/slots";

export type PdfInput = { name: string; base64: string; isScanned: boolean };

const LOCATION_RULES = `Locating values (required for every value you report):
- "doc" is the document number from its label. "page" is the page within that document.
- "quote" is copied verbatim from the page: the filled-in value plus a few neighboring words, exactly as printed or typed, so it can be searched for on the page.
- "box" is your best estimate of where the value sits on that page, as [left, top, right, bottom] fractions of page width and height from the top-left corner. Estimate even on scans.
- "source" is the paragraph reference.

Filing: for each document, pick the file slot it belongs in (${SLOT_GUIDE}). Photos of paper pages are documents too: read them like scans.`;

const SYSTEM = `You read executed Texas residential real estate contract packets (TREC promulgated forms, often with Texas REALTORS addenda) for a brokerage's transaction file.

Rules:
- Extract only what is written. Never guess. If a field is blank, illegible, or absent, set found to false with confidence "low" and add a warning.
- Dates as YYYY-MM-DD. Money as plain numbers. Day counts as integers.
- The effective date is the date the broker fills in on the execution page, not a signature date. If it is blank, set found to false and warn.
- Handwritten or scanned pages: read them carefully; lower confidence when the handwriting is unclear.
- List every addendum actually attached. Also list addenda checked in Para 22 but not attached, with evidence "checked_only".
- Use warnings for conflicts (e.g. two different closing dates), missing initials, or strike-throughs that change terms.

${LOCATION_RULES}

Fields to look for (report each one you find in "fields"; leave out what isn't there):
${FIELD_GUIDE}`;

const CHANGES_SYSTEM = `You compare NEW documents added to an existing Texas real estate transaction against the deal's CURRENT confirmed terms (given as JSON).

Rules:
- Report only terms the new documents actually change. If a document restates a term without changing it, do not report it.
- Typical sources: TREC Amendment to Contract (price, closing date, option period extension, repairs, other terms), new addenda, a signed Seller's Disclosure, termination notices.
- An amendment that extends the option period to a date: report key "option_period_end_date" with that date.
- If the option fee changes, report the new TOTAL option fee.
- If a document doesn't change any term (an inspection report, an HOA document, a receipt), report no changes and just classify it in "documents".
- Never guess. Unclear handwriting gets confidence "low" and a warning. Missing signatures or initials get a warning.
- Changes you can't map to a field (repair lists, special provisions) go in warnings in one short line each.

${LOCATION_RULES}`;

function docBlocks(pdfs: PdfInput[]): Anthropic.ContentBlockParam[] {
  const out: Anthropic.ContentBlockParam[] = [];
  pdfs.forEach((p, i) => {
    out.push({ type: "text", text: `Document ${i + 1} of ${pdfs.length}: ${p.name}${p.isScanned ? " (scanned, no text layer)" : ""}` });
    out.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.base64 } });
  });
  return out;
}

/**
 * One read. Uses structured output (output_config.format): the answer comes back as JSON that
 * matches the schema. Forced tool_choice is not used; current models reject it.
 * Streams so long contracts never hit the non-streaming time limit. Retries once with more room
 * if the answer was cut off, and once if it came back unusable.
 */
/** The API refused the schema itself (as opposed to the file or the request). */
export function isSchemaRejection(e: unknown) {
  if (!(e instanceof Anthropic.APIError) || e.status !== 400) return false;
  return /grammar|schema|output_config|json_schema|strict tool/i.test(String(e.message));
}

/** Pull a JSON object out of a plain-text answer (fallback mode may wrap it in ``` fences). */
export function jsonFromText(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? t.slice(start, end + 1) : t);
}

/**
 * One read. First choice: structured output (output_config.format), so the answer is JSON that
 * matches the schema. Forced tool_choice is not used; current models reject it.
 * If the API refuses the schema itself (an undocumented grammar ceiling, Oct 31), the same read
 * runs again without a grammar: the schema goes in the instructions and the same converter and
 * validation check the answer. Streams; retries with more room if cut off, and once if unusable.
 */
async function callStructured<T>(
  system: string, content: Anthropic.ContentBlockParam[],
  format: { type: "json_schema"; schema: Record<string, unknown> },
  fromWire: (raw: any) => unknown, parse: (x: unknown) => T,
) {
  const client = new Anthropic();
  const model = process.env.EXTRACTION_MODEL || "claude-sonnet-5-5";
  let maxTokens = 16000;
  let grammar = true;
  let lastDetail = "";
  let unusable = 0;
  for (let attempt = 1; attempt <= 3 && unusable < 2; attempt++) {
    let msg;
    try {
      msg = await client.messages.stream(grammar
        ? { model, max_tokens: maxTokens, system, output_config: { format }, messages: [{ role: "user", content }] }
        : {
            model, max_tokens: maxTokens,
            system: `${system}\n\nAnswer with only one JSON object, no other text, matching this JSON schema exactly:\n${JSON.stringify(format.schema)}`,
            messages: [{ role: "user", content }],
          }).finalMessage();
    } catch (e) {
      if (grammar && isSchemaRejection(e)) {
        console.warn("[read] schema refused by the API; reading again without a grammar", String((e as Error).message));
        grammar = false;
        continue;
      }
      throw e;
    }

    if (msg.stop_reason === "refusal") throw new ReaderError("The contract reader declined to read this file. Check that it's the right document.", "stop_reason=refusal");
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
    if (msg.stop_reason === "max_tokens") { lastDetail = `cut off at ${maxTokens} tokens`; maxTokens = 32000; continue; }
    try {
      return { result: parse(fromWire(jsonFromText(text))), model };
    } catch (e) {
      unusable++;
      lastDetail = `unparseable answer (${e instanceof Error ? e.message : e}): ${text.slice(0, 300)}`;
    }
  }
  throw new ReaderError("The contract reader gave an answer we couldn't use. Try again.", lastDetail);
}

export async function readContract(pdfs: PdfInput[]): Promise<{ extraction: Extraction; model: string }> {
  const { result, model } = await callStructured(
    SYSTEM,
    [...docBlocks(pdfs), { type: "text", text: "Record every transaction detail in this packet." }],
    extractionFormat, extractionFromWire,
    (x) => ExtractionSchema.parse(x),
  );
  return { extraction: result, model };
}

const TRIAGE_SYSTEM = `You sort documents emailed into a Texas real estate brokerage's transaction system.
For each document, say what it is and which file slot it belongs in. Find the property's street address (house number and street) exactly as written; if documents disagree or no address is readable, leave it empty with confidence "low". Never guess an address. Photos of paper pages are documents: read them like scans.
Slots: ${SLOT_GUIDE}`;

export async function triageDocuments(pdfs: PdfInput[]): Promise<{ triage: Triage; model: string }> {
  const { result, model } = await callStructured(
    TRIAGE_SYSTEM,
    [...docBlocks(pdfs), { type: "text", text: "Say what these documents are and which property they concern." }],
    triageFormat, triageFromWire,
    (x) => TriageSchema.parse(x),
  );
  return { triage: result, model };
}

export async function readChanges(current: Record<string, unknown>, pdfs: PdfInput[]): Promise<{ changes: ChangeResult; model: string }> {
  const { result, model } = await callStructured(
    CHANGES_SYSTEM,
    [
      { type: "text", text: `CURRENT confirmed terms:\n${JSON.stringify(current, null, 2)}` },
      ...docBlocks(pdfs),
      { type: "text", text: "Record how these new documents change the deal. Report only real changes." },
    ],
    changesFormat, changesFromWire,
    (x) => ChangeSchema.parse(x),
  );
  return { changes: result, model };
}
