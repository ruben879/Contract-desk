import Link from "next/link";
import { cx } from "./ui";

/** One card, the whole card opens the deal, one primary action. */
export function StreamCardView({ href, eyebrow, title, when, more, tone, action }: {
  href: string; eyebrow: string; title: string; when?: string; more?: number; tone?: "bad" | "warn" | "muted"; action?: React.ReactNode;
}) {
  return (
    <li className="relative rounded-card bg-card p-[18px] shadow-card">
      <div className="text-sm text-muted">{eyebrow}</div>
      <Link href={href} className="mt-0.5 block text-[18px] font-semibold leading-snug after:absolute after:inset-0 after:rounded-card after:content-['']">
        {title}
      </Link>
      {when && <div className={cx("mt-1", tone === "bad" ? "font-medium text-bad" : tone === "warn" ? "font-medium text-warn" : "text-muted")}>{when}</div>}
      {!!more && <div className="text-muted">and {more} more</div>}
      {action && <div className="mt-3.5">{action}</div>}
    </li>
  );
}

