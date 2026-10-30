"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function LogoUpload({ brokerageId, current, save }: { brokerageId: string; current: string | null; save: (path: string) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 2 * 1024 * 1024) { setError("Use a PNG, JPG, or WebP under 2 MB."); return; }
    setBusy(true); setError(null);
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${brokerageId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabaseBrowser().storage.from("branding").upload(path, f, { contentType: f.type });
    if (error) { setError(error.message); setBusy(false); return; }
    await save(path);
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {current ? <img src={current} alt="Logo" className="h-full w-full object-contain" /> : <span className="text-xs text-muted">No logo</span>}
      </div>
      <div>
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="text-sm font-semibold text-brand">
          {busy ? "Uploading..." : current ? "Replace logo" : "Upload logo"}
        </button>
        {error && <p className="text-xs text-bad">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
