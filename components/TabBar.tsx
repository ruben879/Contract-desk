"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

// Mirrors Rock Solid's bar: three labeled tabs with Today raised in the middle; the active side
// tab gets a soft navy pill behind its icon. Same line-icon style (24px grid, 2px stroke).
// Account and everything else (More) sit in the circle at the top right, as in Rock Solid.
const base = (size = 22) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });
const IDeals = () => <svg {...base()}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" /></svg>;
const IToday = () => <svg {...base(28)}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></svg>;
const IPeople = () => <svg {...base()}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></svg>;

const TABS = [
  { href: "/deals", label: "Deals", icon: <IDeals />, match: (p: string) => p.startsWith("/deals") || p.startsWith("/t/") },
  { href: "/", label: "Today", icon: <IToday />, match: (p: string) => p === "/", center: true },
  { href: "/contacts", label: "Contacts", icon: <IPeople />, match: (p: string) => p.startsWith("/contacts") },
];

export function TabBar() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl justify-around">
        {TABS.map((t) => {
          const on = t.match(path);
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
              className={cx("flex flex-1 flex-col items-center gap-[3px] px-1 pb-[9px] pt-2.5 text-[12.5px]",
                t.center ? "font-semibold text-ink" : on ? "font-semibold text-brand" : "font-medium text-muted")}>
              {t.center ? (
                <span className={cx("-mt-[30px] grid h-[62px] w-[62px] place-items-center rounded-full bg-brand text-white shadow-[0_6px_16px_rgba(30,58,110,.35),0_0_0_5px_#fff]",
                  on && "shadow-[0_6px_16px_rgba(30,58,110,.45),0_0_0_5px_#fff,0_0_0_7px_rgba(30,58,110,.35)]")}>{t.icon}</span>
              ) : (
                <span className={cx("rounded-full px-[18px] py-1 transition", on && "bg-[color-mix(in_srgb,var(--color-brand)_13%,transparent)] shadow-[0_2px_8px_rgba(30,58,110,.12)] [&_svg]:stroke-[2.4]")}>{t.icon}</span>
              )}
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
