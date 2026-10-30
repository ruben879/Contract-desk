"use client";
import { useState } from "react";

export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="break-all text-left font-mono text-sm text-brand"
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {text} <span className="font-sans text-xs text-muted">{done ? "Copied" : "Tap to copy"}</span>
    </button>
  );
}
