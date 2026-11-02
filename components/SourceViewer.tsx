"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { matchItems } from "@/lib/highlight";
import { cx } from "./ui";

// Shows a page of a PDF with the spot an extracted value came from highlighted.
// Text-layer PDFs: exact highlight from the quote. Scans: the reader's approximate box, labeled as such.

export type SourceTarget = {
  doc: number | null; page: number | null; quote: string | null; box: number[] | null;
  value?: unknown; label?: string;
};
export type ViewerDoc = { name: string; url: string | undefined; scanned: boolean };

type Ctx = { show: (t: SourceTarget) => void; active: SourceTarget | null };
const SourceCtx = createContext<Ctx>({ show: () => {}, active: null });
export const useSource = () => useContext(SourceCtx);

type Rect = { left: number; top: number; width: number; height: number };

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function pdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjsPromise;
}

const docCache = new Map<string, Promise<import("pdfjs-dist").PDFDocumentProxy>>();
function loadDoc(lib: typeof import("pdfjs-dist"), url: string) {
  if (!docCache.has(url)) docCache.set(url, lib.getDocument(url).promise);
  return docCache.get(url)!;
}

function PdfPage({ doc, page, target, onPages }: { doc: ViewerDoc; page: number; target: SourceTarget | null; onPages: (n: number) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rects, setRects] = useState<{ rects: Rect[]; approx: boolean } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!doc.url || !canvas.current || !holder.current) return;
      try {
        setError(null);
        const lib = await pdfjs();
        const pdf = await loadDoc(lib, doc.url);
        if (cancelled) return;
        onPages(pdf.numPages);
        const p = await pdf.getPage(Math.min(Math.max(page, 1), pdf.numPages));
        const width = holder.current.clientWidth || 600;
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: width / base.width });
        const ratio = window.devicePixelRatio || 1;
        const c = canvas.current;
        c.width = Math.floor(viewport.width * ratio);
        c.height = Math.floor(viewport.height * ratio);
        c.style.width = `${viewport.width}px`;
        c.style.height = `${viewport.height}px`;
        await p.render({ canvasContext: c.getContext("2d")!, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
        if (cancelled) return;
        setSize({ w: viewport.width, h: viewport.height });

        if (!target) { setRects(null); return; }
        const text = await p.getTextContent();
        const items = text.items.filter((i): i is typeof i & { str: string; transform: number[]; width: number } => "str" in i);
        const hit = items.length ? matchItems(items.map((i) => i.str), target.quote, target.value) : null;
        if (hit) {
          setRects({
            approx: false,
            rects: hit.map((idx) => {
              const it = items[idx];
              const t = lib.Util.transform(viewport.transform, it.transform);
              const h = Math.hypot(t[2], t[3]);
              return { left: t[4] - 2, top: t[5] - h - 2, width: it.width * viewport.scale + 4, height: h + 5 };
            }),
          });
        } else if (target.box) {
          const [x0, y0, x1, y1] = target.box;
          setRects({ approx: true, rects: [{ left: x0 * viewport.width - 6, top: y0 * viewport.height - 6, width: (x1 - x0) * viewport.width + 12, height: (y1 - y0) * viewport.height + 12 }] });
        } else setRects(null);
      } catch {
        if (!cancelled) setError("This document couldn't be displayed.");
      }
    })();
    return () => { cancelled = true; };
  }, [doc.url, page, target, onPages]);

  useEffect(() => {
    if (rects?.rects[0]) holder.current?.querySelector("[data-hl]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [rects]);

  return (
    <div ref={holder} className="relative w-full">
      {error && <p className="p-4 text-sm text-bad">{error}</p>}
      <canvas ref={canvas} className="block w-full rounded-lg bg-white shadow-sm" />
      {size && rects?.rects.map((r, i) => (
        <div key={i} data-hl
          className={cx("pointer-events-none absolute rounded", rects.approx ? "border-2 border-dashed border-warn bg-warn/10" : "bg-yellow-300/45 ring-2 ring-yellow-500")}
          style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
      ))}
      {rects?.approx && <div className="mt-2 text-xs text-warn">Approximate spot. This page is a scan, so check the highlighted area by eye.</div>}
      {target && !rects && size && <div className="mt-2 text-xs text-muted">Couldn't pinpoint the exact words on this page. It's somewhere on page {page}.</div>}
    </div>
  );
}

function Viewer({ docs, target, onClose }: { docs: ViewerDoc[]; target: SourceTarget | null; onClose?: () => void }) {
  const [docIdx, setDocIdx] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const onPages = useRef((n: number) => setPages(n)).current;

  useEffect(() => {
    if (!target) return;
    if (target.doc && target.doc <= docs.length) setDocIdx(target.doc - 1);
    setPage(target.page ?? 1);
  }, [target, docs.length]);

  if (!docs.length) return <p className="p-4 text-sm text-muted">No documents to show.</p>;
  const doc = docs[docIdx];
  const onTarget = !!target && (target.doc ?? 1) - 1 === docIdx && (target.page ?? 1) === page;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
        {docs.length > 1 ? (
          <select value={docIdx} onChange={(e) => { setDocIdx(Number(e.target.value)); setPage(1); }} className="min-w-0 flex-1 truncate rounded-lg border border-line bg-white px-2 py-1">
            {docs.map((d, i) => <option key={i} value={i}>{d.name}</option>)}
          </select>
        ) : <span className="min-w-0 flex-1 truncate font-medium">{doc.name}</span>}
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg px-2 py-1 hover:bg-paper disabled:opacity-30" aria-label="Previous page">‹</button>
        <span className="shrink-0 text-muted">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg px-2 py-1 hover:bg-paper disabled:opacity-30" aria-label="Next page">›</button>
        {onClose && <button type="button" onClick={onClose} className="ml-1 rounded-lg px-2 py-1 font-semibold text-brand">Done</button>}
      </div>
      {onTarget && target?.label && <div className="bg-yellow-50 px-3 py-1.5 text-xs">Showing where we read <b>{target.label}</b></div>}
      <div className="flex-1 overflow-auto p-3">
        <PdfPage key={docIdx} doc={doc} page={page} target={onTarget ? target : null} onPages={onPages} />
      </div>
    </div>
  );
}

/**
 * Wraps a review screen: the form on the left, the document on the right (desktop);
 * on phones the document opens full screen when a field's "Show in document" is tapped.
 */
export function SourceLayout({ docs, children }: { docs: ViewerDoc[]; children: React.ReactNode }) {
  const [active, setActive] = useState<SourceTarget | null>(null);
  const [sheet, setSheet] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const f = () => setDesktop(m.matches);
    f(); m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  const show = (t: SourceTarget) => { setActive({ ...t }); setSheet(true); };

  return (
    <SourceCtx.Provider value={{ show, active }}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">{children}</div>
        {desktop && (
          <aside>
            <div className="sticky top-4 h-[calc(100dvh-2rem)] overflow-hidden rounded-card bg-card shadow-card">
              <Viewer docs={docs} target={active} />
            </div>
          </aside>
        )}
      </div>
      {!desktop && sheet && active && (
        <div className="fixed inset-0 z-50 bg-paper">
          <Viewer docs={docs} target={active} onClose={() => setSheet(false)} />
        </div>
      )}
    </SourceCtx.Provider>
  );
}

/** "Show in document" link that sits under any extracted value. */
export function ShowSource({ target }: { target: SourceTarget }) {
  const { show, active } = useSource();
  if (!target.page && !target.quote && !target.box) return null;
  const on = active && active.label === target.label && active.page === target.page && active.doc === target.doc;
  return (
    <button type="button" onClick={() => show(target)}
      className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", on ? "bg-yellow-100 text-ink" : "text-brand hover:bg-brand-soft")}>
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 3h8l4 4v6H2z" /><path d="M5 9h6M5 11h4" /></svg>
      {target.doc && target.page ? `Doc ${target.doc}, p. ${target.page}` : target.page ? `Page ${target.page}` : "Show"}
    </button>
  );
}
