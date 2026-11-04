import Link from "next/link";
import { cx } from "./ui";
import type { DiffRow } from "@/lib/offer/match";

// Shown on the confirm screen when the executed contract matches an offer written here.
// Confirming keeps the signed values (what's in the form below); the offer becomes executed.
export function WrittenVsSigned({ offerId, rows }: { offerId: string; rows: DiffRow[] }) {
  const changed = rows.filter((r) => r.changed).length;
  return (
    <section className="mb-4 rounded-card bg-card p-[18px] shadow-card">
      <h2 className="text-[17px] font-semibold">This matches an offer you wrote</h2>
      <p className="mb-3 text-[15px] text-muted">
        {changed ? `${changed} ${changed === 1 ? "term changed" : "terms changed"} between what you wrote and what was signed.` : "What was signed matches what you wrote."}{" "}
        Confirming keeps the signed values. <Link href={`/o/${offerId}`} className="text-brand underline underline-offset-[3px]">See the offer</Link>
      </p>
      <table className="w-full text-[15px]">
        <thead><tr className="text-left text-[13px] text-muted"><th className="pb-1 font-medium"></th><th className="pb-1 font-medium">Written</th><th className="pb-1 font-medium">Signed</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-changed={r.changed || undefined} className={cx("border-t border-line", r.changed && "bg-warn-soft")}>
              <td className="py-2 pl-1 pr-2 font-medium">{r.label}</td>
              <td className={cx("py-2 pr-2", r.changed && "text-muted line-through decoration-1")}>{r.written}</td>
              <td className={cx("py-2 pr-1", r.changed && "font-semibold text-warn")}>{r.signed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
