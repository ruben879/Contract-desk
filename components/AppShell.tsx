import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { cx } from "./ui";
import { supabaseServer } from "@/lib/supabase/server";

/** Unread mentions for the signed-in person (RLS limits the count to their own). */
async function unreadMentions() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data: mine } = await supabase.from("brokerage_members").select("id").eq("user_id", user.id).eq("active", true);
    const ids = (mine ?? []).map((m) => m.id);
    if (!ids.length) return 0;
    const { count } = await supabase.from("comment_mentions").select("comment_id", { count: "exact", head: true }).in("member_id", ids).is("read_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function AppShell({ brokerage, logoUrl, showSettings, wide, children }: {
  brokerage: string; logoUrl?: string | null; showSettings: boolean; wide?: boolean; children: React.ReactNode;
}) {
  const unread = await unreadMentions();
  return (
    <div className={cx("mx-auto px-4 pb-28", wide ? "max-w-6xl" : "max-w-3xl")}>
      <header className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Link href="/" className="flex min-w-0 items-baseline gap-2 leading-tight sm:flex-col sm:items-start sm:gap-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />}
          <div className="min-w-0">
            <div className="font-bold text-brand">{APP_NAME}</div>
            <div className="text-xs text-muted">{brokerage}</div>
          </div>
        </Link>
        <nav className="-mx-2.5 flex shrink-0 gap-0.5 text-sm">
          <Link href="/" className="rounded-lg px-2.5 py-2 hover:bg-white">Deals</Link>
          <Link href="/queue" className="flex items-center gap-1 rounded-lg px-2.5 py-2 hover:bg-white">
            Queue
            {unread > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-5 text-white" aria-label={`${unread} unread mention${unread === 1 ? "" : "s"}`}>@{unread}</span>}
          </Link>
          <Link href="/contacts" className="rounded-lg px-2.5 py-2 hover:bg-white">Contacts</Link>
          {showSettings
            ? <Link href="/settings" className="rounded-lg px-2.5 py-2 hover:bg-white">Settings</Link>
            : <Link href="/profile" className="rounded-lg px-2.5 py-2 hover:bg-white">Profile</Link>}
        </nav>
      </header>
      {children}
    </div>
  );
}
