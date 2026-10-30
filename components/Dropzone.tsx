"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { photosToPdfFile } from "./photo-client";
import { cx } from "./ui";

export type Starter = (files: { name: string; size: number; type: string }[]) => Promise<{ transactionId: string; uploads: { id: string; path: string; token: string; name: string }[] }>;
export const ACCEPT = "application/pdf,.pdf,image/*";

const isPdfFile = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/**
 * Shared upload flow. PDFs upload as they are; photos (from the phone camera or library)
 * are combined into one PDF so they're read like a scanned document.
 * then = "read": first read of a new deal. "reread": check added documents for changes.
 */
export function useUploader(start: Starter, then: "read" | "reread") {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    setError(null);
    try {
      const pdfs = picked.filter(isPdfFile);
      const photos = picked.filter((f) => !isPdfFile(f) && f.type.startsWith("image/"));
      if (pdfs.length + photos.length < picked.length) throw new Error("Use PDFs or photos.");
      const files = [...pdfs];
      if (photos.length) {
        setBusy(`Preparing ${photos.length} photo${photos.length === 1 ? "" : "s"}...`);
        files.push(await photosToPdfFile(photos));
      }

      setBusy("Uploading...");
      const { transactionId, uploads } = await start(files.map((f) => ({ name: f.name, size: f.size, type: "application/pdf" })));
      const sb = supabaseBrowser();
      for (let i = 0; i < uploads.length; i++) {
        setBusy(`Uploading ${i + 1} of ${uploads.length}...`);
        const { error } = await sb.storage.from("documents").uploadToSignedUrl(uploads[i].path, uploads[i].token, files[i], { contentType: "application/pdf" });
        if (error) throw new Error(`${uploads[i].name}: ${error.message}`);
      }
      if (then === "read") {
        await fetch(`/api/transactions/${transactionId}/extract`, { method: "POST" });
        router.push(`/t/${transactionId}`);
      } else {
        const res = await fetch(`/api/transactions/${transactionId}/reread`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ documentIds: uploads.map((u) => u.id) }),
        });
        if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Saved, but it couldn't be checked for changes.");
        router.refresh();
        setBusy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setBusy(null);
    }
  }
  return { upload, busy, error };
}

export function Dropzone({ start, then = "read", label, hint, compact }: {
  start: Starter; then?: "read" | "reread"; label: string; hint?: string; compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { upload, busy, error } = useUploader(start, then);

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        disabled={!!busy}
        className={cx(
          "w-full rounded-2xl border-2 border-dashed text-center transition",
          compact ? "px-4 py-4" : "px-4 py-10",
          over ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-brand",
        )}
      >
        <div className={cx("font-semibold text-brand", !compact && "text-lg")}>{busy ?? label}</div>
        {hint && !busy && <div className="mt-1 text-sm text-muted">{hint}</div>}
      </button>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
