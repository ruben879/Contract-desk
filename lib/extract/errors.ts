import Anthropic from "@anthropic-ai/sdk";

// What a person sees when a read fails: one plain sentence. The technical detail goes to the
// server log (and the extraction row's result.debug) for whoever is fixing it, never on screen.

/** An error whose message is already written for the agent. */
export class ReaderError extends Error {
  constructor(message: string, readonly detail?: string) { super(message); }
}

const GENERIC = "The contract reader couldn't process this file. Try again; if it keeps failing, your broker has the details.";

export function friendlyReadError(e: unknown): { message: string; detail: string } {
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (e instanceof ReaderError) return { message: e.message, detail: e.detail ?? detail };
  if (e instanceof Anthropic.APIError) {
    const s = e.status ?? 0;
    const text = `${e.message}`.toLowerCase();
    if (s === 401 || s === 403) return { message: "The contract reader isn't set up correctly. Your broker has been sent the details.", detail };
    if (s === 429 || s === 529 || s >= 500) return { message: "The contract reader is busy right now. Try again in a minute.", detail };
    // Problems with our request (schema, grammar, settings) are never the agent's file. Check these first:
    // the Oct 31 grammar error said "too large" and was wrongly shown as a file-size problem.
    if (/grammar|schema|output_config|tool_choice|strict tool|invalid_request_error.*(tool|format)/.test(text)) return { message: GENERIC, detail };
    if (s === 413 || /request (body )?(is )?too large|request_too_large|payload too large|maximum (request|file) size/.test(text))
      return { message: "This file is too big to read in one go. Split it into smaller PDFs and add them.", detail };
    if (/(more than|maximum of|exceeds?|limit of) \d+ (pdf )?pages|too many pages|page limit/.test(text))
      return { message: "This file has too many pages to read at once (the limit is 100). Split it into smaller PDFs and add them.", detail };
    if (/password|encrypted/.test(text)) return { message: "This PDF is password-protected. Save an unlocked copy and add that.", detail };
    return { message: GENERIC, detail };
  }
  if (e instanceof Anthropic.APIConnectionError || (e as any)?.name === "APIConnectionTimeoutError")
    return { message: "Couldn't reach the contract reader. Try again in a minute.", detail };
  return { message: "Something went wrong reading this file. Try again; if it keeps failing, your broker has the details.", detail };
}

/** Guard for messages saved before plain wording existed (e.g. raw API JSON from Oct 31). */
export function displayError(saved: string | null | undefined): string {
  const fallback = "Something went wrong reading this file. Try again; if it keeps failing, your broker has the details.";
  if (!saved) return fallback;
  const technical = /[{}]|invalid_request_error|request_id|req_[0-9a-z]|^\d{3}\b|Error:|tool_choice/i.test(saved);
  return technical ? fallback : saved;
}
