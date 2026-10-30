import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type BtnProps = { variant?: "primary" | "quiet" | "danger"; size?: "md" | "lg"; className?: string };
const btn = ({ variant = "primary", size = "md", className }: BtnProps) =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed",
    size === "lg" ? "px-5 py-3.5 text-base w-full" : "px-4 py-2.5 text-sm",
    variant === "primary" && "bg-brand text-white hover:bg-brand-dark shadow-sm",
    variant === "quiet" && "bg-transparent text-brand hover:bg-brand-soft",
    variant === "danger" && "bg-bad-soft text-bad hover:bg-bad hover:text-white",
    className,
  );

export function Button({ variant, size, className, ...p }: BtnProps & ComponentProps<"button">) {
  return <button className={btn({ variant, size, className })} {...p} />;
}
export function ButtonLink({ variant, size, className, ...p }: BtnProps & ComponentProps<typeof Link>) {
  return <Link className={btn({ variant, size, className })} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl border border-line bg-card p-4 sm:p-5", className)} {...p} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "brand" | "warn" | "bad" | "good"; children: ReactNode }) {
  const tones = {
    neutral: "bg-paper text-muted border-line",
    brand: "bg-brand-soft text-brand border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    bad: "bg-bad-soft text-bad border-transparent",
    good: "bg-good-soft text-good border-transparent",
  };
  return <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft";

export const money = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
