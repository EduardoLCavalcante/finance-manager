import { describe, expect, it } from "vitest";
import { addPurchase, applyCommand, emptyState, personBalance } from "../src/lib/finance/engine";
import { chargeRows, totals, unassignedPurchases } from "../src/lib/finance/selectors";

const id = () => crypto.randomUUID();
const filters = { month: "", bank: "", card: "", category: "", person: "", search: "" };
function fixture() {
  const state = emptyState();
  state.audit.push({ id: id(), action: "start", created_at: "2026-10-18T12:00:00Z" });
  state.cards.push(
    { id: id(), institution_id: "nubank", name: "Nubank", last_four: "4457", closing_day: 10, due_day: 19 },
    { id: id(), institution_id: "inter", name: "Inter", last_four: "6671", closing_day: 5, due_day: 12 },
  );
  state.people.push({ id: id(), name: "Ana", is_owner: false });
  const historical = addPurchase(state, { card_id: state.cards[0].id, merchant: "Histórica", purchase_date: "2026-09-01", amount: 101, installments: 3, first_month: "2026-10", category_id: null });
  const pending = addPurchase(state, { card_id: state.cards[1].id, merchant: "Mercado", purchase_date: "2026-10-18", amount: 200, installments: 1, first_month: "2026-11", category_id: null });
  const future = addPurchase(state, { card_id: state.cards[0].id, merchant: "Futura", purchase_date: "2027-02-01", amount: 300, installments: 1, first_month: "2027-03", category_id: null });
  return { state, historical, pending, future };
}

describe("unassigned purchase management", () => {
  it("lists each pending or historical purchase once, including future purchases, newest first", () => {
    const f = fixture();
    expect(f.state.charges).toHaveLength(5);
    expect(unassignedPurchases(f.state, filters).map(r => r.purchase.id)).toEqual([f.future.id, f.pending.id, f.historical.id]);
    expect(unassignedPurchases(f.state, filters).at(-1)?.purchase.amount).toBe(101);
    expect(unassignedPurchases(f.state, { ...filters, bank: "inter" }).map(r => r.purchase.id)).toEqual([f.pending.id]);
    expect(unassignedPurchases(f.state, { ...filters, card: f.state.cards[0].id })).toHaveLength(2);
    expect(unassignedPurchases(f.state, { ...filters, search: "  MERCADO  " }).map(r => r.purchase.id)).toEqual([f.pending.id]);
    expect(unassignedPurchases(f.state, { ...filters, search: "ausente" })).toEqual([]);
  });

  it.each(["historical", "pending"] as const)("skips %s without changing invoices, charges or balances and audits the command once", status => {
    const f = fixture(), purchase = f[status];
    const command = { id: id(), type: "skip_assignment", purchase_id: purchase.id };
    const skipped = applyCommand(f.state, command);
    expect(skipped.purchases.find(p => p.id === purchase.id)?.status).toBe("skipped");
    expect(unassignedPurchases(skipped, filters)).toHaveLength(2);
    expect(skipped.invoices).toEqual(f.state.invoices);
    expect(skipped.charges).toEqual(f.state.charges);
    expect(skipped.allocations).toEqual([]);
    expect(chargeRows(skipped, filters)).toHaveLength(5);
    expect(totals(skipped, filters)).toMatchObject({ total: totals(f.state, filters).total, receivable: 0, unassigned: status === "pending" ? 300 : 500 });
    expect(skipped.audit.at(-1)).toMatchObject({ id: command.id, action: "skip_assignment" });
    expect(applyCommand(skipped, command)).toBe(skipped);
    expect(f.state.purchases.find(p => p.id === purchase.id)?.status).toBe(status);
  });

  it.each(["historical", "pending", "skipped"] as const)("assigns %s voluntarily, preserves exact shared cents and removes it from the queue", status => {
    const f = fixture();
    const state = status === "skipped" ? applyCommand(f.state, { id: id(), type: "skip_assignment", purchase_id: f.historical.id }) : f.state;
    const purchase = status === "pending" ? f.pending : f.historical;
    const shares = [{ person_id: state.people[0].id, amount: 51 }, { person_id: state.people[1].id, amount: purchase.amount - 51 }];
    const command = { id: id(), type: "classify", purchase_id: purchase.id, category_id: state.categories[0].id, allocations: shares };
    const assigned = applyCommand(state, command);
    expect(assigned.purchases.find(p => p.id === purchase.id)).toMatchObject({ status: "confirmed", category_id: state.categories[0].id });
    expect(personBalance(assigned, state.people[1].id).balance).toBe(purchase.amount - 51);
    expect(unassignedPurchases(assigned, filters).some(r => r.purchase.id === purchase.id)).toBe(false);
    expect(assigned.charges).toEqual(state.charges);
    expect(() => applyCommand(assigned, { ...command, id: id() })).toThrow("já foi atribuída");
    expect(() => applyCommand(assigned, { id: id(), type: "skip_assignment", purchase_id: purchase.id })).toThrow("já foi atribuída");
  });

  it("rejects missing purchases and invalid shares without partial mutation", () => {
    const f = fixture(), before = structuredClone(f.state);
    expect(() => applyCommand(f.state, { id: id(), type: "skip_assignment", purchase_id: id() })).toThrow("não encontrado");
    expect(() => applyCommand(f.state, { id: id(), type: "skip_assignment", purchase_id: "invalid" })).toThrow();
    expect(() => applyCommand(f.state, { id: id(), type: "classify", purchase_id: f.historical.id, category_id: f.state.categories[0].id, allocations: [{ person_id: f.state.people[0].id, amount: 100 }] })).toThrow("somar");
    expect(f.state).toEqual(before);
  });

  it("shows an empty queue after every purchase has been skipped", () => {
    const f = fixture();
    const skipped = f.state.purchases.reduce((state, purchase) => applyCommand(state, { id: id(), type: "skip_assignment", purchase_id: purchase.id }), f.state);
    expect(unassignedPurchases(skipped, filters)).toEqual([]);
    expect(totals(skipped, filters).unassigned).toBe(0);
  });
});
