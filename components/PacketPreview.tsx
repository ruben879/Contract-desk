"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cx } from "./ui";
import { exportPacket, setBlankIntentional } from "@/app/o/actions";
import { sharePacket } from "./OfferPackets";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function pdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjsPromise;
}

/** The packet's pages, read-only. Rendered from the same code the export uses. */
export function PacketPages({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const lib = await pdfjs();
        const doc = await lib.getDocument({ url: src }).promise;
        const el = box.current!;
        el.innerHTML = "";
        const width = Math.min(el.clientWidth || 640, 820);
        for (let i = 1; i <= doc.numPages && !dead; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = `${width}px`; canvas.className = "mb-3 rounded-lg bg-white shadow-card";
          canvas.setAttribute("aria-label", `Page ${i} of ${doc.numPages}`);
          el.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
          if (i === 1) setState("ready");
        }
      } catch { if (!dead) setState("error"); }
    })();
    return () => { dead = true; };
  }, [src]);
  return (
    <div>
      {state === "loading" && <p className="py-8 text-center text-muted">Building the packet…</p>}
      {state === "error" && <p className="py-8 text-center text-bad">Couldn't show the packet. Go back and try again.</p>}
      <div ref={box} />
    </div>
  );
}

export type BlankRow = { id: string; form: string; label: string; intentional: boolean };

export function BlanksLeft({ offerId, blanks }: { offerId: string; blanks: BlankRow[] }) {
  const [pending, start] = useTransition();
  if (!blanks.length) return <p className="text-[15px] text-muted">No blanks left.</p>;
  return (
    <ul className="flex flex-col">
      {blanks.map((b) => (
        <li key={b.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
          <span className={cx("text-[15px]", b.intentional && "text-muted")}><span className="text-muted">{b.form}: </span>{b.label}</span>
          <span className="flex shrink-0 gap-1">
            <button disabled={pending} onClick={() => start(() => setBlankIntentional(offerId, b.id, !b.intentional))} aria-pressed={b.intentional}
              className={cx("min-h-11 rounded-xl px-3 text-[14px] font-medium", b.intentional ? "bg-good-soft text-good" : "bg-paper text-ink")}>
              {b.intentional ? "Intentional ✓" : "Intentional"}
            </button>
            <Link href={`/o/${offerId}`} className="inline-flex min-h-11 items-center rounded-xl px-3 text-[14px] font-medium text-brand">Go back</Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ExportButton({ offerId, blocked, reExport }: { offerId: string; blocked: string[]; reExport: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button disabled={busy || blocked.length > 0}
        className="inline-flex min-h-[54px] w-full items-center justify-center rounded-xl bg-brand px-5 text-[17px] font-medium text-white disabled:opacity-45"
        onClick={async () => {
          setBusy(true); setMsg(null);
          const r = await exportPacket(offerId);
          if ("error" in r) setMsg(r.error);
          else { await sharePacket(r.url, r.fileName); setMsg(`Version ${r.version} saved. Send it for signatures from your own e-sign or email.`); }
          setBusy(false);
        }}>
        {busy ? "Building…" : "Export packet (PDF)"}
      </button>
      {blocked.length > 0 && <p className="mt-2 text-[15px] font-medium text-bad">Add these first: {blocked.join(", ")}.</p>}
      {reExport && !msg && blocked.length === 0 && <p className="mt-2 text-[14px] text-muted">This makes a new version. Earlier versions stay as they were.</p>}
      {msg && <p className="mt-2 text-[15px] text-muted">{msg}</p>}
    </div>
  );
}
