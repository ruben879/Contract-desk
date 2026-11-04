"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { importRenFile, startDocumentFill } from "@/app/o/actions";
import { cx } from "./ui";

/**
 * The two ways to fill an offer besides typing: Ren's terms file, or a document the app reads.
 * offerId null = start a new offer from it. Either way the agent lands on the Terms screen to review.
 */
export function OfferFill({ offerId, compact }: { offerId: string | null; compact?: boolean }) {
  const router = useRouter();
  const json = useRef<HTMLInputElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "import" | "read">(null);
  const [err, setErr] = useState<string | null>(null);

  const done = (id: string) => { if (offerId) { router.refresh(); } else router.push(`/o/${id}`); };

  async function onJson(file: File) {
    setBusy("import"); setErr(null);
    const r = await importRenFile(offerId, await file.text(), file.name);
    if ("error" in r) setErr(r.error); else done(r.id);
    setBusy(null);
  }
  async function onPdf(file: File) {
    setBusy("read"); setErr(null);
    try {
      const { path, token } = await startDocumentFill();
      const up = await supabaseBrowser().storage.from("documents").uploadToSignedUrl(path, token, file, { contentType: "application/pdf" });
      if (up.error) throw new Error("The upload didn't go through. Try again.");
      const res = await fetch("/api/offers/fill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId, path, fileName: file.name }) });
      const r = await res.json().catch(() => ({ error: "Couldn't read that document. Try again." }));
      if (r.error) setErr(r.error); else done(r.id);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that document. Try again."); }
    setBusy(null);
  }

  const btn = cx("inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border-[1.5px] border-line bg-card px-3 text-[15px] font-medium text-brand disabled:opacity-50", compact && "text-[14px]");
  return (
    <div>
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={!!busy} onClick={() => pdf.current?.click()}>{busy === "read" ? "Reading the document…" : "Fill from a document"}</button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => json.current?.click()}>{busy === "import" ? "Importing…" : "Import terms file"}</button>
      </div>
      <input ref={pdf} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onPdf(f); }} />
      <input ref={json} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onJson(f); }} />
      {err && <p className="mt-2 text-[15px] font-medium text-bad">{err}</p>}
    </div>
  );
}
