import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { renderPacket, packetParts, p22Values, bundledBytes } from "@/lib/offer/render";
import { compareToBlank } from "@/lib/forms/integrity";
import { BUNDLED_FORMS, P22_SLOTS } from "@/lib/forms/registry";
import { loadForm, inventory } from "@/lib/forms/acroform";
import { exportBlockers, enforceRules, emptyTerms, OFFER_ADDENDA, type OfferTerms } from "@/lib/offer/terms";
import { brookhollowTerms } from "./fixtures/brookhollow-offer";

const pagesOf = (id: keyof typeof BUNDLED_FORMS) => BUNDLED_FORMS[id].pages;

describe("forms registry", () => {
  it("each pinned form is the supplied file, with its fillable fields", async () => {
    for (const spec of Object.values(BUNDLED_FORMS)) {
      const fields = inventory(await loadForm(await bundledBytes(spec.id)));
      expect(fields.length, spec.id).toBe(spec.fieldCount);
    }
  });
  it("every mapped field name exists on its form", async () => {
    for (const spec of Object.values(BUNDLED_FORMS)) {
      const names = new Set(inventory(await loadForm(await bundledBytes(spec.id))).map((f) => f.name));
      for (const m of spec.map) expect(names.has(m.field), `${spec.id}: ${m.field}`).toBe(true);
      for (const g of spec.groups) for (const f of g.fields) expect(names.has(f), `${spec.id}: ${f}`).toBe(true);
    }
  });
});

describe("Brookhollow (brief acceptance fixture)", () => {
  it("packet is the 20-19 plus the HOA addendum, in that order", async () => {
    const r = await renderPacket(brookhollowTerms(), []);
    expect(r.parts.map((p) => (p.kind === "bundled" ? p.id : p.formId))).toEqual(["TREC-20-19", "TREC-36-11"]);
  });

  it("contract pages match the official blank 20-19 except filled blanks (text and position)", async () => {
    const r = await renderPacket(brookhollowTerms(), []);
    const report = await compareToBlank(await bundledBytes("TREC-20-19"), r.bytes, 0);
    expect(report.problems).toEqual([]);
    expect(report.added).toBeGreaterThan(15);
    const hoa = await compareToBlank(await bundledBytes("TREC-36-11"), r.bytes, pagesOf("TREC-20-19"));
    expect(hoa.problems).toEqual([]);
  }, 60_000);

  it("Para 3 shows the cash pattern; Para 22 shows HOA checked; the effective date stays blank", async () => {
    const r = await renderPacket(brookhollowTerms(), []);
    const v = r.contractValues;
    expect(v["undefined_3"]).toBe("425,000.00");   // 3A cash portion
    expect(v["undefined_4"]).toBeUndefined();      // 3B blank
    expect(v["B Sum of all financing described in the attached"]).toBeUndefined();
    expect(v["undefined_5"]).toBe("425,000.00");   // 3C
    expect(v["Check Box9"]).toBe(true);            // 22: HOA
    expect(v["Addendum for Reservation of Oil Gas"]).toBe(false); // 22: TPF
    for (const f of ["EXECUTED the", "day of", "20_2"]) expect(v[f]).toBeUndefined();
    expect(v["A The closing of the sale will be on or before"]).toBe("November 11");
    expect(v["20"]).toBe("26");
  });
});

describe("financing", () => {
  it("Conventional auto-includes the Financing Addendum and blocks export until its fields are set", async () => {
    const t = brookhollowTerms({ financing_type: "conventional" });
    expect(t.addenda).toContain("third_party_financing");
    expect(packetParts(t, []).map((p) => p.kind === "bundled" && p.id)).toEqual(["TREC-20-19", "TREC-40-11", "TREC-36-11"]);
    expect(exportBlockers(t)).toEqual(["Loan amount (Financing Addendum)", "Loan term (Financing Addendum)", "Interest rate cap (Financing Addendum)"]);
    const ready = { ...t, financed_amount: 340000, loan_term_years: 30, loan_rate_cap: 7.5 };
    expect(exportBlockers(ready)).toEqual([]);
    const r = await renderPacket(ready, []);
    expect(r.contractValues["undefined_3"]).toBe("85,000.00");
    expect(r.contractValues["undefined_4"]).toBe("340,000.00");
    expect(r.contractValues["Addendum for Reservation of Oil Gas"]).toBe(true);
    const fin = await compareToBlank(await bundledBytes("TREC-40-11"), r.bytes, pagesOf("TREC-20-19"));
    expect(fin.problems).toEqual([]);
  }, 60_000);

  it("cash can't carry the Financing Addendum, and the appraisal addendum is only for conventional or other", () => {
    expect(enforceRules({ ...brookhollowTerms(), addenda: ["third_party_financing"] }).addenda).not.toContain("third_party_financing");
    for (const f of ["cash", "fha", "va"] as const) expect(enforceRules({ ...brookhollowTerms(), financing_type: f, addenda: ["appraisal_termination"] }).addenda).not.toContain("appraisal_termination");
    expect(enforceRules({ ...brookhollowTerms(), financing_type: "conventional", addenda: ["appraisal_termination"] }).addenda).toContain("appraisal_termination");
  });
});

describe("Paragraph 22 never disagrees with the Packet", () => {
  // Every combination of the four bundled addenda, under every financing type.
  const combos: OfferTerms[] = [];
  for (const fin of ["cash", "conventional", "fha", "va", "other"] as const)
    for (let mask = 0; mask < 16; mask++)
      combos.push(brookhollowTerms({ financing_type: fin, addenda: OFFER_ADDENDA.filter((_, i) => mask & (1 << i)) }));
  it(`${combos.length} combinations`, () => {
    for (const t of combos) {
      const parts = packetParts(t, []);
      const v = p22Values(parts);
      const inPacket = new Set(parts.filter((p) => p.kind === "bundled").map((p) => (p as any).id));
      for (const s of P22_SLOTS) {
        const owner = ({ third_party_financing: "TREC-40-11", appraisal_termination: "TREC-49-1", lead_based_paint: "TREC-56-0", hoa: "TREC-36-11" } as any)[s.key];
        expect(v[s.field], `${t.financing_type} ${t.addenda} ${s.key}`).toBe(owner ? inPacket.has(owner) : false);
      }
    }
  });
});

describe("export gate", () => {
  it("blocked only by buyer, address, or price; other blanks are listed instead", async () => {
    expect(exportBlockers(emptyTerms())).toEqual(["Buyer name", "Property address", "Sales price"]);
    const t = { ...brookhollowTerms(), title_company: null, option_period_days: null };
    expect(exportBlockers(t)).toEqual([]);
    const r = await renderPacket(t, []);
    const labels = r.blanks.map((b) => b.label);
    expect(labels).toContain("Para 5A: Escrow Agent");
    expect(labels).toContain("Para 5B: Option period days");
  });
});

describe("rules that do not bend", () => {
  it("the effective date is not an offer Term", () => {
    expect(Object.keys(emptyTerms())).not.toContain("effective_date");
  });
  it("no offer code sends anything", () => {
    const files = ["lib/offer/terms.ts", "lib/offer/render.ts", "lib/forms/acroform.ts", "lib/forms/registry.ts"];
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/fetch\(|sendMail|nodemailer|postmark|resend\.|smtp/i);
    // Screens and actions: no mail or message sending of any kind. (The only fetch is the agent's own
    // device downloading the packet it just exported, to hand to the share sheet.)
    const screens = ["app/o/actions.ts", "app/o/[id]/page.tsx", "app/o/[id]/preview/page.tsx", "app/api/offers/[id]/preview/route.ts",
      "components/OfferTermsEditor.tsx", "components/PacketPreview.tsx", "components/OfferPackets.tsx", "lib/offer/server.ts", "lib/offer/match.ts"];
    for (const f of screens) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/sendMail|nodemailer|postmark|resend|sendgrid|twilio|smtp|mailto:/i);
    const fetches = screens.filter((f) => /fetch\(/.test(fs.readFileSync(f, "utf8")));
    expect(fetches).toEqual(["components/OfferPackets.tsx"]);
  });
});
