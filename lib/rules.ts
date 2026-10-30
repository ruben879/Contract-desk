import type { AddendumKey, DisclosureStatus, FinancingType } from "@/lib/addenda";

// One filter for everything that depends on what's in the file: checklist tasks and
// document slots. A rule applies when every condition it names matches the deal.
//
// Contract-type layer (Phase 2): rules can already name `contractTypes`. Phase 1 never sets
// the deal's contract_type, so type-specific rules simply don't apply yet. Adding condo,
// new home, or farm and ranch later means (1) setting contract_type at confirm and
// (2) adding rules with `contractTypes: [...]`. The engine itself doesn't change.

export type Side = "buyer" | "seller" | "both";

export const CONTRACT_TYPES = ["resale", "condo", "new_home_incomplete", "new_home_complete", "farm_ranch", "unimproved"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export type DealContext = {
  side: Side | null;
  addenda: AddendumKey[];
  financing_type: FinancingType | null;
  seller_disclosure: DisclosureStatus | null;
  contract_type?: ContractType | null; // Phase 2
};

export type Conditions = {
  sides?: Side[];                          // omit = all sides
  contractTypes?: ContractType[];          // omit = all contract types
  when?: (c: DealContext) => boolean;      // omit = always
};

export function applies(rule: Conditions, ctx: DealContext): boolean {
  if (rule.sides && ctx.side && !rule.sides.includes(ctx.side)) return false;
  if (rule.contractTypes && (!ctx.contract_type || !rule.contractTypes.includes(ctx.contract_type))) return false;
  if (rule.when && !rule.when(ctx)) return false;
  return true;
}

export const hasAddendum = (k: AddendumKey) => (c: DealContext) => c.addenda.includes(k);
