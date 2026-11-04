import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { FieldMapper, FormDetails, ReplaceVersion } from "@/components/FormLibrary";
import { P22_SLOTS } from "@/lib/forms/registry";
import { TERM_CATALOG } from "@/lib/offer/terms";
import { TXR_ACK_TEXT, mappable, suggestFor, type FieldMap } from "@/lib/forms/library";
import type { FieldInfo } from "@/lib/forms/acroform";

export default async function FormDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  if (!isBrokerOrStaff) redirect("/");
  const { data: form } = await supabase.from("library_forms").select("id, display_name, form_class, p22_slot, archived, current_version_id").eq("id", id).maybeSingle();
  if (!form) notFound();
  const [{ data: versions }, { data: acks }, { data: team }] = await Promise.all([
    supabase.from("library_form_versions").select("id, version, file_name, fields, field_map, mapping_complete, created_at").eq("form_id", id).order("version", { ascending: false }),
    supabase.from("form_acknowledgments").select("id, user_id, text_version, reason, accepted_at, version_id").eq("form_id", id).order("accepted_at", { ascending: false }),
    supabase.from("brokerage_members").select("user_id, full_name, email").eq("brokerage_id", brokerage.id),
  ]);
  const current = (versions ?? []).find((v) => v.id === form.current_version_id) ?? null;
  const fields = (current?.fields ?? []) as FieldInfo[];
  const map = (current?.field_map ?? {}) as FieldMap;
  const decided = (n: string) => { const m = map[n]; return !m ? null : "blank" in m ? "blank" : m.term; };
  const rows = mappable(fields).map((f) => { const s = suggestFor(f); return { name: f.name, type: f.type, page: f.page, suggestion: "blank" in s ? "blank" : s.term, decided: decided(f.name) }; });
  const who = (uid: string) => { const m = (team ?? []).find((x) => x.user_id === uid); return m?.full_name || m?.email || "Someone"; };
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: brokerage.timezone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings>
      <Link href="/settings/forms" className="text-[15px] text-brand">Offers and forms</Link>
      <div className="mb-2 mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">{form.display_name}</h1>
        {form.archived ? <Badge>Archived</Badge> : current?.mapping_complete ? <Badge tone="good">Ready for offers</Badge> : <Badge tone="warn">Mapping not finished</Badge>}
      </div>

      <SectionTitle>Map the fields{current ? ` (version ${current.version})` : ""}</SectionTitle>
      <Card>
        <p className="mb-3 text-[14px] text-muted">For each blank on the form, pick the offer term that fills it, or Leave blank. Signature lines are left for signing and don't need mapping.</p>
        {current ? <FieldMapper versionId={current.id} rows={rows} terms={TERM_CATALOG.map((t) => ({ key: t.key, label: t.label }))} /> : <p className="text-muted">No file yet.</p>}
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card>
        <FormDetails formId={form.id} slots={P22_SLOTS.map((s) => ({ key: s.key, label: s.label }))} ackText={TXR_ACK_TEXT}
          initial={{ displayName: form.display_name, formClass: form.form_class, p22Slot: form.p22_slot, archived: form.archived }} />
      </Card>

      <SectionTitle>New revision</SectionTitle>
      <Card>
        <p className="mb-3 text-[14px] text-muted">Uploading a new revision keeps the field decisions for fields with the exact same names; anything else is mapped again. Packets already exported never change.</p>
        <ReplaceVersion formId={form.id} txr={form.form_class === "TXR"} ackText={TXR_ACK_TEXT} />
        {(versions ?? []).length > 1 && (
          <ul className="mt-3 text-[14px] text-muted">
            {(versions ?? []).map((v) => <li key={v.id}>Version {v.version}: {v.file_name} · {when(v.created_at)}{v.id === form.current_version_id ? " (current)" : ""}</li>)}
          </ul>
        )}
      </Card>

      {!!acks?.length && (
        <>
          <SectionTitle>Texas REALTORS acknowledgments</SectionTitle>
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line text-[14px]">
              {acks.map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  {who(a.user_id)} · {when(a.accepted_at)} · {a.reason === "upload" ? "on upload" : a.reason === "class_change" ? "on class change" : "on new version"} · text {a.text_version}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </AppShell>
  );
}
