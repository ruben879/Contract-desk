"use client";
import { useRouter, usePathname } from "next/navigation";

export function AgentFilter({ value, options }: { value: string; options: { id: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <select aria-label="Filter by agent" value={value}
      onChange={(e) => router.push(e.target.value ? `${path}?agent=${e.target.value}` : path)}
      className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
      <option value="">All agents</option>
      <option value="unassigned">Unassigned deals</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}
