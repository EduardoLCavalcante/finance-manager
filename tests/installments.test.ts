import { describe, expect, it } from "vitest";
import { applyCommand, emptyState, personBalance } from "../src/lib/finance/engine";
import { assignmentPurchases, purchaseGroups } from "../src/lib/finance/installments";
import { addMonths } from "../src/lib/finance/money";
import { unassignedPurchases } from "../src/lib/finance/selectors";
import { importPluggy, type BankTransaction, type PluggyData } from "../src/integrations/pluggy/import";

const id = () => crypto.randomUUID();
const filters = { bank: "", card: "", search: "" };
function fixture(future = false) {
  const state = emptyState();
  state.audit.push({ id: id(), action: "start", created_at: "2026-10-18T12:00:00Z" });
  state.people.push({ id: id(), name: "Ana", is_owner: false });
  const card = { id: id(), institution_id: "nubank" as const, name: "Nubank", last_four: "4457", closing_day: 10, due_day: 19 };
  state.cards.push(card);
  const transactions: BankTransaction[] = [1, 2, 3].map(number => ({ id: id(), accountId: card.id, description: `Loja ${number}/3`, date: addMonths(future ? "2026-11" : "2026-09", number - 1) + "-01", amount: number === 1 ? 30.01 : 30, currencyCode: "BRL", type: "DEBIT", status: "POSTED", creditCardMetadata: { installmentNumber: number, totalInstallments: 3, purchaseDate: "2026-09-01T14:30:00.000Z", billForecastDate: addMonths("2026-10", number - 1) } }));
  const data: PluggyData = { batches: [{ card, bills: [], transactions }], warnings: [], ignoredCards: 0 };
  return { original: state, state: importPluggy(state, data).state, data, transactions };
}
function classify(state: ReturnType<typeof emptyState>, purchaseId: string, amount: number) {
  return applyCommand(state, { id: id(), type: "classify", purchase_id: purchaseId, category_id: state.categories[0].id,
    allocations: [{ person_id: state.people[0].id, amount: Math.ceil(amount / 2) }, { person_id: state.people[1].id, amount: Math.floor(amount / 2) }] });
}
describe("one assignment per bank installment plan", () => {
  it("groups by original purchase and keeps every invoice transaction unchanged", () => {
    const f = fixture();
    expect(f.state.purchases).toHaveLength(3);
    const rows = unassignedPurchases(f.state, filters);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ merchant: "Loja", installmentCount: 3, amount: 9001, historical: false });
    expect(rows[0].purchases).toHaveLength(3);
    expect(unassignedPurchases(f.state, { ...filters, search: "2/3" })).toHaveLength(1);
    expect(f.state.charges.map(charge => charge.amount)).toEqual([3001, 3000, 3000]);
    expect(f.state.sources[0]).toMatchObject({ installment_no: 1, installment_count: 3, original_purchase_date: "2026-09-01T14:30:00.000Z" });
  });
  it("assigns a whole mixed historical/future group with exact shared totals", () => {
    const f = fixture();
    const assigned = classify(f.state, f.state.purchases[2].id, 9001);
    expect(assigned.purchases.every(purchase => purchase.status === "confirmed")).toBe(true);
    expect(personBalance(assigned, assigned.people[0].id).original).toBe(4501);
    expect(personBalance(assigned, assigned.people[1].id).original).toBe(4500);
    for (const purchase of assigned.purchases) expect(assigned.allocations.filter(share => share.purchase_id === purchase.id).reduce((sum, share) => sum + share.amount, 0)).toBe(purchase.amount);
    expect(assigned.charges).toEqual(f.state.charges);
    expect(assigned.invoices).toEqual(f.state.invoices);
    expect(unassignedPurchases(assigned, filters)).toEqual([]);
  });
  it("rejects a single installment amount when a whole group is selected without partial mutation", () => {
    const f = fixture(), before = structuredClone(f.state);
    expect(() => classify(f.state, f.state.purchases[0].id, 3001)).toThrow("somar exatamente");
    expect(f.state).toEqual(before);
  });
  it("keeps one-cent installments positive and the shared group total exact", () => {
    const f = fixture();
    f.transactions.forEach(tx => { tx.amount = 0.01; });
    const state = importPluggy(f.original, f.data).state;
    const assigned = classify(state, state.purchases[0].id, 3);
    expect(assigned.allocations.every(share => share.amount > 0)).toBe(true);
    expect(personBalance(assigned, assigned.people[0].id).original).toBe(2);
    expect(personBalance(assigned, assigned.people[1].id).original).toBe(1);
  });
  it("accepts a group total larger than a single purchase limit without exceeding any individual allocation", () => {
    const f = fixture();
    f.transactions.forEach(tx => { tx.amount = 9999999999.99; });
    const state = importPluggy(f.original, f.data).state;
    const total = state.purchases.reduce((sum, purchase) => sum + purchase.amount, 0);
    const assigned = applyCommand(state, { id: id(), type: "classify", purchase_id: state.purchases[0].id, category_id: null, allocations: [{ person_id: state.people[0].id, amount: total }] });
    expect(assigned.allocations).toHaveLength(3);
    expect(assigned.allocations.every(share => share.amount === 999999999999)).toBe(true);
  });
  it("skips and later assigns the whole group once", () => {
    const f = fixture();
    const skipped = applyCommand(f.state, { id: id(), type: "skip_assignment", purchase_id: f.state.purchases[1].id });
    expect(skipped.purchases.every(purchase => purchase.status === "skipped")).toBe(true);
    expect(unassignedPurchases(skipped, filters)).toEqual([]);
    expect(skipped.allocations).toEqual([]);
    expect(classify(skipped, skipped.purchases[2].id, 9001).purchases.every(purchase => purchase.status === "confirmed")).toBe(true);
  });
  it("preserves already assigned and individually skipped installments", () => {
    const f = fixture();
    f.state.purchases[0].status = "confirmed";
    const originalShare = { id: id(), purchase_id: f.state.purchases[0].id, person_id: f.state.people[0].id, amount: 3001 };
    f.state.allocations.push(originalShare);
    f.state.purchases[1].status = "skipped";
    expect(assignmentPurchases(f.state, f.state.purchases[2].id)).toHaveLength(1);
    const assigned = classify(f.state, f.state.purchases[2].id, 3000);
    expect(assigned.allocations.find(share => share.id === originalShare.id)).toEqual(originalShare);
    expect(assigned.purchases[1].status).toBe("skipped");
  });
  it.each(["date", "time", "merchant", "count", "amount", "duplicate", "missing metadata"])("keeps incompatible or ambiguous installments separate: %s", variation => {
    const f = fixture(), tx = f.transactions[1];
    if (variation === "date") tx.creditCardMetadata!.purchaseDate = "2026-09-02T14:30:00.000Z";
    if (variation === "time") tx.creditCardMetadata!.purchaseDate = "2026-09-01T18:30:00.000Z";
    if (variation === "merchant") tx.description = "Outra loja 2/3";
    if (variation === "count") tx.creditCardMetadata!.totalInstallments = 4;
    if (variation === "amount") tx.amount = 80;
    if (variation === "duplicate") tx.creditCardMetadata!.installmentNumber = 1;
    if (variation === "missing metadata") tx.creditCardMetadata = null;
    const state = importPluggy(f.original, f.data).state;
    expect(purchaseGroups(state).length).toBeGreaterThan(1);
  });
  it("keeps identical installment plans on different cards separate", () => {
    const f = fixture();
    const card = { ...f.data.batches[0].card, id: id() };
    f.data.batches.push({ card, bills: [], transactions: f.transactions.map(tx => ({ ...tx, id: id(), accountId: card.id })) });
    const state = importPluggy(f.original, f.data).state;
    expect(unassignedPurchases(state, filters)).toHaveLength(2);
    expect(unassignedPurchases(state, { ...filters, card: card.id })).toHaveLength(1);
    const assigned = classify(state, state.purchases[0].id, 9001);
    expect(assigned.purchases.filter(purchase => purchase.status === "confirmed")).toHaveLength(3);
  });
  it("handles provider spacing/name truncation and date-only midnight placeholders", () => {
    const f = fixture();
    f.transactions[0].description = "Amazon 1/3";
    f.transactions[1].description = "AMAZON BR 2/3";
    f.transactions[2].description = "Amazon 3/3";
    f.transactions[0].creditCardMetadata!.purchaseDate = "2026-09-01T00:00:00.000Z";
    f.transactions[1].creditCardMetadata!.purchaseDate = "2026-09-01T14:30:00.001Z";
    expect(unassignedPurchases(importPluggy(f.original, f.data).state, filters)).toHaveLength(1);
  });
  it("backfills metadata on existing sources without recreating transactions or changing assignments", () => {
    const f = fixture();
    f.state.sources.forEach(source => { delete source.installment_no; delete source.installment_count; delete source.original_purchase_date; });
    const result = importPluggy(f.state, f.data);
    expect(result.counts).toMatchObject({ existing: 3, imported: 0 });
    expect(result.state.purchases).toEqual(f.state.purchases);
    expect(result.state.charges).toEqual(f.state.charges);
    expect(unassignedPurchases(result.state, filters)).toHaveLength(1);
  });
  it.each(["assigned", "skipped"])("applies the %s choice to installments arriving in later syncs, once", choice => {
    const f = fixture(true);
    const partial = importPluggy(f.original, { ...f.data, batches: [{ ...f.data.batches[0], transactions: [f.transactions[0]] }] }).state;
    const saved = choice === "assigned" ? classify(partial, partial.purchases[0].id, 3001) : applyCommand(partial, { id: id(), type: "skip_assignment", purchase_id: partial.purchases[0].id });
    const next = importPluggy(saved, f.data).state;
    expect(next.purchases.every(purchase => purchase.status === (choice === "assigned" ? "confirmed" : "skipped"))).toBe(true);
    expect(unassignedPurchases(next, filters)).toEqual([]);
    const repeat = importPluggy(next, f.data).state;
    expect(repeat.allocations).toEqual(next.allocations);
    expect(repeat.purchases).toEqual(next.purchases);
  });
  it("does not assign newly discovered historical installments automatically", () => {
    const f = fixture();
    const partial = importPluggy(f.original, { ...f.data, batches: [{ ...f.data.batches[0], transactions: [f.transactions[2]] }] }).state;
    const assigned = classify(partial, partial.purchases[0].id, 3000);
    const next = importPluggy(assigned, f.data).state;
    expect(next.purchases.filter(purchase => purchase.status === "historical")).toHaveLength(2);
    expect(next.allocations).toEqual(assigned.allocations);
  });
  it("keeps conflicting existing choices intact and leaves a new installment to review", () => {
    const f = fixture(true);
    const partial = importPluggy(f.original, { ...f.data, batches: [{ ...f.data.batches[0], transactions: f.transactions.slice(0, 2) }] }).state;
    partial.purchases.forEach((purchase, i) => { purchase.status = "confirmed"; partial.allocations.push({ id: id(), purchase_id: purchase.id, person_id: partial.people[i].id, amount: purchase.amount }); });
    const next = importPluggy(partial, f.data).state;
    expect(next.purchases[2].status).toBe("pending");
    expect(next.allocations).toEqual(partial.allocations);
  });
});
