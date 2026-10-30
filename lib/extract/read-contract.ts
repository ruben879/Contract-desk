import Anthropic from "@anthropic-ai/sdk";
import { ChangeSchema, changesTool, ExtractionSchema, extractionTool, TriageSchema, triageTool, type ChangeResult, type Extraction, type Triage } from "./schema";
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
- Extract only what is written. Never guess. If a field is blank, illegible, or absent, return null with confidence "low" and add a warning.
- Dates as YYYY-MM-DD. Money as plain numbers. Day counts as integers.
- The effective date is the date the broker fills in on the execution page, not a signature date. If it is blank, return null and warn.
- Handwritten or scanned pages: read them carefully; lower confidence when the handwriting is unclear.
- List every addendum actually attached. Also list addenda checked in Para 22 but not attached, with evidence "checked_only".
- Use warnings for conflicts (e.g. two different closing dates), missing initials, or strike-throughs that change terms.

${LOCATION_RULES}`;

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

async function callTool<T>(system: string, content: Anthropic.ContentBlockParam[], tool: { name: string; description: string; input_schema: any }, parse: (x: unknown) => T) {
  const client = new Anthropic();
  const model = process.env.EXTRACTION_MODEL || "claude-sonnet-5-5";
  const msg = await client.messages.create({
    model, max_tokens: 12000, system, tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content }],
  });
  const call = msg.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") throw new Error("The contract reader returned no result.");
  return { result: parse(call.input), model };
}

export async function readContract(pdfs: PdfInput[]): Promise<{ extraction: Extraction; model: string }> {
  const { result, model } = await callTool(
    SYSTEM,
    [...docBlocks(pdfs), { type: "text", text: "Record every transaction detail with the record_contract tool." }],
    extractionTool,
    (x) => ExtractionSchema.parse(x),
  );
  return { extraction: result, model };
}

const TRIAGE_SYSTEM = `You sort documents emailed into a Texas real estate brokerage's transaction system.
For each document, say what it is and which file slot it belongs in. Find the property's street address (house number and street) exactly as written; if documents disagree or no address is readable, return null and confidence "low". Never guess an address. Photos of paper pages are documents: read them like scans.
Slots: ${SLOT_GUIDE}`;

export async function triageDocuments(pdfs: PdfInput[]): Promise<{ triage: Triage; model: string }> {
  const { result, model } = await callTool(
    TRIAGE_SYSTEM,
    [...docBlocks(pdfs), { type: "text", text: "Triage these documents with the triage_documents tool." }],
    triageTool,
    (x) => TriageSchema.parse(x),
  );
  return { triage: result, model };
}

export async function readChanges(current: Record<string, unknown>, pdfs: PdfInput[]): Promise<{ changes: ChangeResult; model: string }> {
  const { result, model } = await callTool(
    CHANGES_SYSTEM,
    [
      { type: "text", text: `CURRENT confirmed terms:\n${JSON.stringify(current, null, 2)}` },
      ...docBlocks(pdfs),
      { type: "text", text: "Record how these new documents change the deal with the record_changes tool." },
    ],
    changesTool,
    (x) => ChangeSchema.parse(x),
  );
  return { changes: result, model };
}
