import type { FinanceState, Purchase } from "./types";

export type PurchaseGroup = { purchases: Purchase[]; merchant: string; installmentCount: number | null };
export function installmentMerchant(merchant: string) {
  return merchant.replace(/\s+(?:[-–]\s*)?(?:parcela\s*)?\(?\d{1,3}\s*(?:\/|de)\s*\d{1,3}\)?\s*$/i, "").trim();
}
function sameMerchant(a: string, b: string) {
  const normalize = (name: string) => installmentMerchant(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const left = normalize(a), right = normalize(b);
  return !!left && !!right && (left === right || (Math.min(left.length, right.length) >= 6 && (left.startsWith(right) || right.startsWith(left))));
}
export function purchaseGroups(state: FinanceState): PurchaseGroup[] {
  const sources = new Map(state.sources.filter(source => source.source_type === "pluggy").map(source => [source.purchase_id, source]));
  const buckets = new Map<string, Purchase[]>();
  const standalone: PurchaseGroup[] = [];
  for (const purchase of state.purchases) {
    const source = sources.get(purchase.id);
    if (!source?.original_purchase_date || !source.installment_no || !source.installment_count || source.installment_count < 2 || source.installment_no > source.installment_count || purchase.installments !== 1) {
      standalone.push({ purchases: [purchase], merchant: purchase.merchant, installmentCount: null });
      continue;
    }
    const key = JSON.stringify([purchase.card_id, source.original_purchase_date.slice(0, 10), source.installment_count]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(purchase); buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    const visited = new Set<string>();
    const moment = (purchase: Purchase) => {
      const date = new Date(sources.get(purchase.id)!.original_purchase_date!).toISOString();
      return date.slice(11, 19) === "00:00:00" ? null : date.slice(0, 19);
    };
    const matches = (a: Purchase, b: Purchase) => sameMerchant(a.merchant, b.merchant) && Math.abs(a.amount - b.amount) <= sources.get(a.id)!.installment_count!
      && (!moment(a) || !moment(b) || moment(a) === moment(b));
    for (const purchase of bucket) {
      if (visited.has(purchase.id)) continue;
      const candidates = bucket.filter(other => matches(purchase, other));
      const candidateIds = new Set(candidates.map(purchase => purchase.id));
      // shortcut: ambiguous or duplicate installment numbers stay separate until the bank provides a stable purchase ID.
      const unambiguous = new Set(candidates.map(p => sources.get(p.id)!.installment_no)).size === candidates.length
        && candidates.every(a => { const related = bucket.filter(b => matches(a, b)); return related.length === candidates.length && related.every(purchase => candidateIds.has(purchase.id)); });
      const purchases = unambiguous ? candidates : [purchase];
      purchases.forEach(p => visited.add(p.id));
      purchases.sort((a, b) => sources.get(a.id)!.installment_no! - sources.get(b.id)!.installment_no!);
      standalone.push({ purchases, merchant: installmentMerchant(purchases[0].merchant), installmentCount: sources.get(purchase.id)!.installment_count! });
    }
  }
  return standalone;
}
export function assignmentPurchases(state: FinanceState, purchaseId: string) {
  const group = purchaseGroups(state).find(group => group.purchases.some(purchase => purchase.id === purchaseId));
  const target = group?.purchases.find(purchase => purchase.id === purchaseId);
  return group?.purchases.filter(purchase => purchase.status !== "confirmed" && (purchase.status !== "skipped" || target?.status === "skipped")) ?? [];
}
