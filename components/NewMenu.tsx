"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { startUpload } from "@/app/actions";
import { createOffer } from "@/app/o/actions";
import { ACCEPT, useUploader } from "./Dropzone";
import { cx } from "./ui";

// The one "New" action on Deals (Ruben, Nov 18): two plain choices. Filling an offer from a
// document or a terms file lives inside the offer itself, not on this page.

function OfferChoice() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={choiceCls}>
      <span className="block text-[16px] font-semibold text-brand">{pending ? "Starting the offer…" : "Write an offer"}</span>
      <span className="block text-sm text-muted">Fill in the terms, or fill them from a document or Ren's terms file.</span>
    </button>
  );
}

const choiceCls = "block w-full rounded-xl border-[1.5px] border-line bg-card px-4 py-3 text-left hover:border-brand disabled:opacity-60";

export function NewMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy, error } = useUploader(startUpload, "read");

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={!!busy}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-dark disabled:opacity-70">
        {busy ?? <><span aria-hidden className="text-lg leading-none">+</span> New</>}
      </button>
      {open && !busy && (
        <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-2 rounded-card bg-paper p-2 shadow-card ring-1 ring-line">
          <button type="button" className={choiceCls} onClick={() => { setOpen(false); input.current?.click(); }}>
            <span className="block text-[16px] font-semibold text-brand">Start from a contract</span>
            <span className="block text-sm text-muted">Choose the executed contract PDF, or take photos of it.</span>
          </button>
          <form action={createOffer}><OfferChoice /></form>
        </div>
      )}
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {error && <p className={cx("absolute right-0 mt-2 w-64 text-right text-sm text-bad")}>{error}</p>}
    </div>
  );
}
