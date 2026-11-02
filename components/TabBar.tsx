"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Same line-icon style as Rock Solid (24px grid, 2px stroke, round caps). Labels always show.
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const ICONS = {
  today: <svg {...base}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></svg>,
  deals: <svg {...base}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" /></svg>,
  contacts: <svg {...base}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></svg>,
  more: <svg {...base}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></svg>,
};
const TABS = [
  { href: "/", label: "Today", icon: ICONS.today, match: (p: string) => p === "/" },
  { href: "/deals", label: "Deals", icon: ICONS.deals, match: (p: string) => p.startsWith("/deals") || p.startsWith("/t/") },
  { href: "/contacts", label: "Contacts", icon: ICONS.contacts, match: (p: string) => p.startsWith("/contacts") },
  { href: "/more", label: "More", icon: ICONS.more, match: (p: string) => ["/more", "/queue", "/sort", "/settings", "/profile"].some((x) => p.startsWith(x)) },
];

/** Four labeled tabs, fixed to the bottom like Rock Solid. */
export function TabBar() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl">
        {TABS.map((t) => {
          const on = t.match(path);
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-[3px] px-1 pb-[9px] pt-2.5 text-[12.5px] ${on ? "font-semibold text-brand [&_svg]:stroke-[2.4]" : "font-medium text-muted"}`}>
              {t.icon}{t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
