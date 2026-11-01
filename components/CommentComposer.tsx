"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteComment, markMentionsRead, postComment } from "@/app/comments/actions";
import { encodeMentions, MAX_COMMENT, mentionQuery } from "@/lib/comments";
import { cx, inputCls } from "./ui";

export type MentionMember = { id: string; name: string; role: string };

const ROLE: Record<string, string> = { broker: "Broker", staff: "Staff", agent: "Agent on this deal" };

/** Plain-text comment box. Type @ to pick someone from the people who can open this deal. */
export function CommentComposer({ transactionId, members }: { transactionId: string; members: MentionMember[] }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<MentionMember[]>([]);
  const [q, setQ] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  const needle = q?.query.toLowerCase().trim() ?? "";
  const matches = q
    ? members.filter((m) => !needle || m.name.toLowerCase().startsWith(needle) || m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(needle))).slice(0, 6)
    : [];
  const open = !!q && matches.length > 0;

  const track = (value: string, caret: number) => { setQ(mentionQuery(value, caret)); setActive(0); };

  function pick(m: MentionMember) {
    if (!q || !box.current) return;
    const caret = box.current.selectionStart ?? text.length;
    const insert = `@${m.name} `;
    const next = text.slice(0, q.start) + insert + text.slice(caret);
    setText(next);
    setPicked((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
    setQ(null);
    const pos = q.start + insert.length;
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(pos, pos); });
  }

  function submit() {
    const body = encodeMentions(text.trim(), picked.filter((m) => text.includes(`@${m.name}`)));
    if (!body) return;
    setError(null);
    start(async () => {
      const r = await postComment(transactionId, body);
      if (r.ok) { setText(""); setPicked([]); setQ(null); } else setError(r.error);
    });
  }

  const tagged = picked.filter((m) => text.includes(`@${m.name}`));

  return (
    <div className="relative">
      <label htmlFor={`comment-${transactionId}`} className="sr-only">Add a comment</label>
      <textarea
        id={`comment-${transactionId}`}
        ref={box}
        value={text}
        rows={3}
        maxLength={MAX_COMMENT}
        placeholder="Add a comment. Type @ to mention someone."
        className={cx(inputCls, "resize-y leading-relaxed")}
        onChange={(e) => { setText(e.target.value); track(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
        onClick={(e) => track(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[active]); return; }
            if (e.key === "Escape") { e.preventDefault(); setQ(null); return; }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
        }}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <ul role="listbox" className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          {matches.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                className={cx("flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm", i === active ? "bg-brand-soft" : "hover:bg-paper")}>
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted">{ROLE[m.role] ?? m.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {tagged.length > 0 && <span className="text-xs text-muted">Notifies {tagged.map((m) => m.name).join(", ")} in their Queue</span>}
        {error && <span className="text-sm text-bad">{error}</span>}
        <button type="button" onClick={submit} disabled={pending || !text.trim()}
          className="ml-auto rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
          {pending ? "Posting..." : "Post comment"}
        </button>
      </div>
      {members.length === 0 && <p className="mt-1 text-xs text-muted">No one else can open this deal yet, so there's no one to mention.</p>}
    </div>
  );
}

export function DeleteCommentButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending}
      onClick={() => { if (confirm("Delete this comment?")) start(() => deleteComment(id)); }}
      className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-paper hover:text-bad disabled:opacity-50">
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}

/** Opening a deal marks your mentions on it read. The page you're looking at keeps its "New" marks. */
export function MarkMentionsRead({ transactionId, count }: { transactionId: string; count: number }) {
  useEffect(() => { if (count > 0) markMentionsRead(transactionId).catch(() => {}); }, [transactionId, count]);
  return null;
}

export function MarkAllMentionsRead() {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => markMentionsRead())}
      className="text-sm font-medium text-brand disabled:opacity-50">
      {pending ? "Marking..." : "Mark all read"}
    </button>
  );
}
