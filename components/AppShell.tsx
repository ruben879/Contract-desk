import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { cx } from "./ui";
import { TabBar } from "./TabBar";

/** Slim top bar (mark and brokerage), content, and the bottom tab bar. */
export function AppShell({ brokerage, logoUrl, wide, children }: {
  brokerage: string; logoUrl?: string | null; showSettings?: boolean; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <>
      <div className={cx("mx-auto px-4 pb-[calc(110px+env(safe-area-inset-bottom))]", wide ? "max-w-6xl" : "max-w-3xl")}>
        <header className="flex min-h-12 items-center pb-2 pt-[calc(12px+env(safe-area-inset-top))]">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="" className="h-[30px] w-[30px] shrink-0 rounded-lg object-contain" />}
            <span className="truncate text-[17px] font-semibold text-brand">{APP_NAME}</span>
            <span className="truncate text-sm text-muted">{brokerage}</span>
          </Link>
        </header>
        {children}
      </div>
      <TabBar />
    </>
  );
}
