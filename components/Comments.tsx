import { splitMentions } from "@/lib/comments";
import { Card, cx } from "./ui";
import { CommentComposer, DeleteCommentButton, type MentionMember } from "./CommentComposer";

export type CommentRow = {
  id: string; body: string; created_at: string; author_member_id: string;
  unreadForMe?: boolean;
};

export const formatWhen = (iso: string, timezone: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone });

/** A comment body with mentions marked. Your own name stands out. */
export function CommentBody({ body, nameOf, meId }: { body: string; nameOf: (id: string) => string | null; meId: string }) {
  return (
    <p className="whitespace-pre-wrap break-words leading-relaxed">
      {splitMentions(body).map((p, i) => "text" in p ? <span key={i}>{p.text}</span> : (
        <span key={i} className={cx("rounded px-1 font-semibold", p.member === meId ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand")}>
          @{nameOf(p.member) ?? "someone"}
        </span>
      ))}
    </p>
  );
}

/** Comments on one deal: post box on top, newest first. Separate from the system history. */
export function CommentsSection({ transactionId, comments, members, meId, timezone, nameOf }: {
  transactionId: string; comments: CommentRow[]; members: MentionMember[]; meId: string; timezone: string;
  nameOf: (id: string) => string | null;
}) {
  return (
    <Card className="p-0 sm:p-0">
      <div className="border-b border-line p-4">
        <CommentComposer transactionId={transactionId} members={members.filter((m) => m.id !== meId)} />
      </div>
      {comments.length === 0 ? (
        <p className="p-4 text-sm text-muted">No comments yet. Type @ to bring someone in.</p>
      ) : (
        <ul className="divide-y divide-line">
          {comments.map((c) => (
            <li key={c.id} className={cx("px-4 py-3", c.unreadForMe && "border-l-4 border-l-brand bg-brand-soft/30")}>
              <div className="mb-1 flex items-center gap-2 text-sm">
                <span className="font-semibold">{nameOf(c.author_member_id) ?? "Former member"}</span>
                <span className="text-xs text-muted">{formatWhen(c.created_at, timezone)}</span>
                {c.unreadForMe && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">New mention</span>}
                {c.author_member_id === meId && <span className="ml-auto"><DeleteCommentButton id={c.id} /></span>}
              </div>
              <CommentBody body={c.body} nameOf={nameOf} meId={meId} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
