import { describe, expect, it } from "vitest";
import { buildChecklist } from "@/lib/checklist/rules";

const keys = (c: Parameters<typeof buildChecklist>[0]) => buildChecklist(c).map((i) => i.rule_key);
const base = { side: "buyer" as const, addenda: [] as any[], financing_type: "cash" as const, seller_disclosure: "received" as const };

describe("checklist triggers", () => {
  it("cash deal with disclosure: standard tasks only", () => {
    const k = keys(base);
    expect(k).toContain("earnest_delivered");
    expect(k.some((x) => x.startsWith("fin_") || x.startsWith("hoa_"))).toBe(false);
    expect(k).not.toContain("get_sellers_disclosure");
  });
  it("Third Party Financing Addendum adds financing tasks", () => {
    expect(keys({ ...base, addenda: ["third_party_financing"] })).toEqual(expect.arrayContaining(["fin_appraisal_ordered", "fin_buyer_approval", "fin_contract_to_lender"]));
  });
  it("HOA addendum adds HOA tasks", () => {
    expect(keys({ ...base, addenda: ["hoa"] })).toEqual(expect.arrayContaining(["hoa_request_docs", "hoa_deliver_docs"]));
  });
  it("missing seller's disclosure adds the get-it-signed task", () => {
    expect(keys({ ...base, seller_disclosure: "not_received" })).toContain("get_sellers_disclosure");
    expect(keys({ ...base, seller_disclosure: "unknown" })).toContain("get_sellers_disclosure");
    expect(keys({ ...base, seller_disclosure: "unknown", addenda: ["sellers_disclosure"] })).not.toContain("get_sellers_disclosure");
    expect(keys({ ...base, seller_disclosure: "not_required" })).not.toContain("get_sellers_disclosure");
  });
  it("seller side skips buyer-only tasks", () => {
    const k = keys({ ...base, side: "seller" });
    expect(k).not.toContain("inspections_scheduled");
    expect(k).toContain("option_decision");
  });
  it("intake-completed tasks start done and carry a reason only when triggered", () => {
    const list = buildChecklist({ ...base, addenda: ["hoa"] });
    expect(list.find((i) => i.rule_key === "executed_contract")?.status).toBe("done");
    expect(list.find((i) => i.rule_key === "hoa_request_docs")?.reason).toBe("HOA addendum is in the file");
    expect(list.find((i) => i.rule_key === "contract_to_title")?.reason).toBeNull();
  });
});

import { applies } from "@/lib/rules";
import { slotsFor } from "@/lib/slots";

describe("contract-type layer (Phase 2 hook)", () => {
  const rule = { contractTypes: ["condo" as const] };
  it("type-specific rules stay off while Phase 1 leaves contract_type unset", () => {
    expect(applies(rule, base)).toBe(false);
  });
  it("turn on once a deal has that type, with no engine change", () => {
    expect(applies(rule, { ...base, contract_type: "condo" })).toBe(true);
    expect(applies(rule, { ...base, contract_type: "resale" })).toBe(false);
  });
  it("Phase 1 tasks are unaffected by a contract type", () => {
    expect(keys({ ...base, contract_type: "farm_ranch" })).toEqual(keys(base));
  });
});

describe("document slots", () => {
  const k = (c: any, filled: string[] = []) => slotsFor(c, new Set(filled)).map((s) => s.key);
  it("HOA and financing slots appear only with their addenda", () => {
    expect(k(base)).not.toContain("hoa_documents");
    expect(k({ ...base, addenda: ["hoa", "third_party_financing"] })).toEqual(expect.arrayContaining(["hoa_documents", "hoa_addendum", "lender_documents"]));
  });
  it("seller side has no inspection slot, but a filled slot always shows", () => {
    expect(k({ ...base, side: "seller" })).not.toContain("inspections");
    expect(k({ ...base, side: "seller" }, ["inspections"])).toContain("inspections");
  });
  it("before confirm, only contract and other", () => expect(k(null)).toEqual(["contract", "other"]));
});
