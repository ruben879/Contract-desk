"use client";
import { useState } from "react";
import { packetLink } from "@/app/o/actions";

/** Hand the agent the file: the share sheet where the device has one, otherwise a download. */
export async function sharePacket(url: string, fileName: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], fileName, { type: "application/pdf" });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return; // closed the share sheet
    window.location.href = url;
  }
}

export function PacketDownload({ packetId, version, fileName, exportedAt, timezone }: { packetId: string; version: number; fileName: string; exportedAt: string; timezone: string }) {
  const [busy, setBusy] = useState(false);
  const when = new Date(exportedAt).toLocaleString("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <button disabled={busy} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px]"
      onClick={async () => { setBusy(true); const r = await packetLink(packetId); if ("url" in r) await sharePacket(r.url, fileName); setBusy(false); }}>
      <span className="font-medium text-brand">Version {version}</span>
      <span className="text-muted">{busy ? "Opening…" : when}</span>
    </button>
  );
}
