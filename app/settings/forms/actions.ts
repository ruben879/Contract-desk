"use server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CATALOG_BY_KEY } from "@/lib/offer/terms";
import { P22_SLOTS } from "@/lib/forms/registry";
import { TXR_ACK_VERSION, UploadRefused, carryOverMap, checkUpload, mappingComplete, needsAcknowledgment, type FieldMap } from "@/lib/forms/library";

type FormClass = "TREC" | "TXR" | "Brokerage";
const CLASSES: FormClass[] = ["TREC", "TXR", "Brokerage"];
const SLOT_KEYS = new Set<string>(P22_SLOTS.map((s) => s.key));

/** Broker or staff of this brokerage, or nothing. Agents can pick forms but never manage them. */
async function manager() {
  const ctx = await requireMember();
  if (!ctx.isBrokerOrStaff) throw new Error("Only the broker or staff can manage the form library.");
  return ctx;
}

/** Step 1 of an upload: a one-time place to put the file, inside this brokerage's folder. */
export async function startFormUpload(): Promise<{ path: string; token: string }> {
  const { brokerage } = await manager();
  const path = `${brokerage.id}/incoming/${randomUUID()}.pdf`;
  const { data, error } = await supabaseAdmin().storage.from("library-forms").createSignedUploadUrl(path);
  if (error || !data) throw new Error("Couldn't start the upload.");
  return { path, token: data.token };
}

async function inspect(path: string, brokerageId: string) {
  if (!path.startsWith(`${brokerageId}/incoming/`)) throw new UploadRefused("Upload not found.");
  const admin = supabaseAdmin();
  const { data: blob } = await admin.storage.from("library-forms").download(path);
  if (!blob) throw new UploadRefused("Upload not found. Try again.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try { return { bytes, ...(await checkUpload(bytes)) }; }
  catch (e) { await admin.storage.from("library-forms").remove([path]); throw e; }
}

/** Move the checked file to its permanent, never-overwritten place. Byte-identical: we copy, not re-save. */
async function keep(incoming: string, brokerageId: string, formId: string, version: number) {
  const admin = supabaseAdmin();
  const dest = `${brokerageId}/${formId}/v${version}.pdf`;
  const { error } = await admin.storage.from("library-forms").move(incoming, dest);
  if (error) throw new Error("Couldn't save the file.");
  return dest;
}

type Result = { ok: true; formId: string } | { error: string };

export async function finishFormUpload(input: { path: string; fileName: string; displayName: string; formClass: string; p22Slot: string | null; acknowledged: boolean }): Promise<Result> {
  try {
    const { supabase, user, brokerage } = await manager();
    const formClass = input.formClass as FormClass;
    if (!CLASSES.includes(formClass)) return { error: "Pick the form's class." };
    if (!input.displayName.trim()) return { error: "Give the form a name agents will recognize." };
    if (input.p22Slot && !SLOT_KEYS.has(input.p22Slot)) return { error: "Pick a Paragraph 22 line, or none." };
    const { bytes, fields, pageCount } = await inspect(input.path, brokerage.id);
    if (needsAcknowledgment(formClass) && !input.acknowledged) {
      await supabaseAdmin().storage.from("library-forms").remove([input.path]);
      return { error: "Texas REALTORS forms need the acknowledgment before they can be added." };
    }

    const { data: form, error: fe } = await supabase.from("library_forms").insert({
      brokerage_id: brokerage.id, display_name: input.displayName.trim(), form_class: formClass, p22_slot: input.p22Slot || null, created_by: user.id,
    }).select("id").single();
    if (fe || !form) return { error: "Couldn't add the form." };
    const storage_path = await keep(input.path, brokerage.id, form.id, 1);
    const { data: v, error: ve } = await supabase.from("library_form_versions").insert({
      brokerage_id: brokerage.id, form_id: form.id, version: 1, storage_path, file_name: input.fileName,
      sha256: createHash("sha256").update(bytes).digest("hex"), page_count: pageCount, fields, uploaded_by: user.id,
    }).select("id").single();
    if (ve || !v) return { error: "Couldn't add the form." };
    await supabase.from("library_forms").update({ current_version_id: v.id }).eq("id", form.id);
    if (formClass === "TXR") await supabase.from("form_acknowledgments").insert({ brokerage_id: brokerage.id, form_id: form.id, version_id: v.id, user_id: user.id, text_version: TXR_ACK_VERSION, reason: "upload" });
    revalidatePath("/settings/forms");
    return { ok: true, formId: form.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add the form." };
  }
}

/** Replace with a new revision. The old version stays stored; packets exported with it never change. */
export async function replaceFormVersion(input: { formId: string; path: string; fileName: string; acknowledged: boolean }): Promise<Result> {
  try {
    const { supabase, user, brokerage } = await manager();
    const { data: form } = await supabase.from("library_forms")
      .select("id, form_class, current:library_form_versions!library_forms_current_fk(id, version, field_map)").eq("id", input.formId).maybeSingle();
    if (!form) return { error: "Form not found." };
    const { bytes, fields, pageCount } = await inspect(input.path, brokerage.id);
    if (form.form_class === "TXR" && !input.acknowledged) {
      await supabaseAdmin().storage.from("library-forms").remove([input.path]);
      return { error: "Texas REALTORS forms need the acknowledgment before a new version can be added." };
    }
    const { data: last } = await supabase.from("library_form_versions").select("version").eq("form_id", form.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (last?.version ?? 0) + 1;
    const prev = form.current as unknown as { field_map: FieldMap } | null;
    const field_map = carryOverMap(prev?.field_map ?? {}, fields);
    const storage_path = await keep(input.path, brokerage.id, form.id, version);
    const { data: v, error } = await supabase.from("library_form_versions").insert({
      brokerage_id: brokerage.id, form_id: form.id, version, storage_path, file_name: input.fileName,
      sha256: createHash("sha256").update(bytes).digest("hex"), page_count: pageCount, fields, field_map,
      mapping_complete: mappingComplete(fields, field_map), uploaded_by: user.id,
    }).select("id").single();
    if (error || !v) return { error: "Couldn't add the new version." };
    await supabase.from("library_forms").update({ current_version_id: v.id }).eq("id", form.id);
    if (form.form_class === "TXR") await supabase.from("form_acknowledgments").insert({ brokerage_id: brokerage.id, form_id: form.id, version_id: v.id, user_id: user.id, text_version: TXR_ACK_VERSION, reason: "new_version" });
    revalidatePath(`/settings/forms/${form.id}`);
    return { ok: true, formId: form.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add the new version." };
  }
}

/** One field's decision, made by a person. Nothing is ever confirmed on its own. */
export async function confirmField(versionId: string, field: string, choice: string | null): Promise<{ ok: true; complete: boolean } | { error: string }> {
  const { supabase } = await manager();
  const { data: v } = await supabase.from("library_form_versions").select("id, form_id, fields, field_map").eq("id", versionId).maybeSingle();
  if (!v) return { error: "Form not found." };
  const fields = v.fields as { name: string; type: string }[];
  if (!fields.some((f) => f.name === field)) return { error: "That field isn't on this form." };
  const map = { ...(v.field_map as FieldMap) };
  if (choice === null) delete map[field];
  else if (choice === "blank") map[field] = { blank: true };
  else if (CATALOG_BY_KEY.has(choice)) map[field] = { term: choice };
  else return { error: "Pick a term or Leave blank." };
  const complete = mappingComplete(fields as never, map);
  const { error } = await supabase.from("library_form_versions").update({ field_map: map, mapping_complete: complete }).eq("id", versionId);
  if (error) return { error: "Couldn't save." };
  revalidatePath(`/settings/forms/${v.form_id}`);
  return { ok: true, complete };
}

export async function updateFormDetails(input: { formId: string; displayName: string; formClass: string; p22Slot: string | null; archived: boolean; acknowledged: boolean }): Promise<Result> {
  const { supabase, user, brokerage } = await manager();
  const { data: form } = await supabase.from("library_forms").select("id, form_class, current_version_id").eq("id", input.formId).maybeSingle();
  if (!form) return { error: "Form not found." };
  const formClass = input.formClass as FormClass;
  if (!CLASSES.includes(formClass)) return { error: "Pick the form's class." };
  if (!input.displayName.trim()) return { error: "The form needs a name." };
  if (input.p22Slot && !SLOT_KEYS.has(input.p22Slot)) return { error: "Pick a Paragraph 22 line, or none." };
  const becomingTxr = needsAcknowledgment(formClass, form.form_class as FormClass);
  if (becomingTxr && !input.acknowledged) return { error: "Changing this to a Texas REALTORS form needs the acknowledgment." };
  const { error } = await supabase.from("library_forms").update({
    display_name: input.displayName.trim(), form_class: formClass, p22_slot: input.p22Slot || null, archived: input.archived,
  }).eq("id", form.id);
  if (error) return { error: "Couldn't save." };
  if (becomingTxr) await supabase.from("form_acknowledgments").insert({ brokerage_id: brokerage.id, form_id: form.id, version_id: form.current_version_id, user_id: user.id, text_version: TXR_ACK_VERSION, reason: "class_change" });
  revalidatePath(`/settings/forms/${form.id}`);
  revalidatePath("/settings/forms");
  return { ok: true, formId: form.id };
}

/** The current version's file, for the mapper to look at while deciding. */
export async function formFileLink(versionId: string): Promise<string | null> {
  const { supabase } = await manager();
  const { data: v } = await supabase.from("library_form_versions").select("storage_path").eq("id", versionId).maybeSingle();
  if (!v) return null;
  const { data } = await supabase.storage.from("library-forms").createSignedUrl(v.storage_path, 600);
  return data?.signedUrl ?? null;
}
