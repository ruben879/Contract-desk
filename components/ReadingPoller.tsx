"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the page every few seconds while a contract is being read. */
export function ReadingPoller() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-white hover:bg-brand-dark"
      onClick={async () => { await fetch(`/api/transactions/${id}/extract`, { method: "POST" }); router.refresh(); }}
    >
      Try reading it again
    </button>
  );
}

export function RetryRereadButton({ id, documentIds }: { id: string; documentIds: string[] }) {
  const router = useRouter();
  return (
    <button className="text-sm font-semibold text-brand"
      onClick={async () => {
        await fetch(`/api/transactions/${id}/reread`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentIds }) });
        router.refresh();
      }}>
      Try again
    </button>
  );
}
