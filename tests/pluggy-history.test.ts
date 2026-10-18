import { afterEach, describe, expect, it, vi } from "vitest";
import { addPurchase, allocationStartDate, applyCommand, emptyState, personBalance } from "../src/lib/finance/engine";
import { bankRows, chargeRows, totals } from "../src/lib/finance/selectors";
import { importPluggy, type BankBill, type BankTransaction, type PluggyData } from "../src/integrations/pluggy/import";
import type { Card } from "../src/lib/finance/types";

const id = () => crypto.randomUUID();
const filters = { month: "", bank: "", card: "", category: "", person: "", search: "" };
function fixture() {
  const state = emptyState();
  state.audit.push({ id: id(), action: "pluggy_sync", created_at: "2026-10-18T12:00:00Z" });
  const card: Card = { id: id(), institution_id: "nubank", name: "Nubank", last_four: "4457", closing_day: 25, due_day: 5 };
  state.cards.push(card);
  const bill: BankBill = { id: id(), dueDate: "2026-09-12", billClosingDate: "2026-09-05", totalAmount: 123.45, totalAmountCurrencyCode: "BRL" };
  const tx: BankTransaction = { id: id(), accountId: card.id, description: "Compra histórica", date: "2026-09-01", amount: 10, type: "DEBIT", status: "POSTED", currencyCode: "BRL", creditCardMetadata: { billId: bill.id } };
  const data: PluggyData = { batches: [{ card, bills: [bill], transactions: [tx] }], warnings: [], ignoredCards: 0 };
  return { state, card, bill, tx, data };
}
afterEach(() => vi.useRealTimers());

describe("complete Pluggy history", () => {
  it("uses only the bank's BRL account amount for foreign purchases, without inventing a conversion", () => {
    const f = fixture(); f.data.batches[0].transactions = [{ ...f.tx, currencyCode: "USD", amount: 10, amountInAccountCurrency: 51.29 }];
    const first = importPluggy(f.state, f.data);
    expect(first.state.purchases[0].amount).toBe(5129);
    expect(importPluggy(first.state, f.data).counts).toMatchObject({ existing: 1, changed: 0 });
    f.data.batches[0].transactions = [{ ...f.tx, currencyCode: "USD", amount: 10 }];
    expect(importPluggy(f.state, f.data).counts.ignored).toBe(1);
  });
  it.each([[1.005, 101], [-1.005, -101], [123.4549, 12345], [123.455, 12346]])("rounds bank bill total %s to %s cents without relaxing transaction validation", (amount, expected) => {
    const f = fixture(); f.bill.totalAmount = amount;
    expect(importPluggy(f.state, f.data).state.invoices[0].statement_total).toBe(expected);
    f.data.batches[0].transactions[0].amount = 0.001;
    expect(() => importPluggy(f.state, f.data)).toThrow();
  });
  it("uses the bank bill, imports historical purchases without allocation and keeps payments separate", () => {
    const f = fixture();
    f.data.batches[0].transactions.push({ ...f.tx, id: id(), description: "Pagamento", type: "CREDIT", amount: -10 });
    const result = importPluggy(f.state, f.data);
    expect(result.counts).toMatchObject({ imported: 1, historical: 1, bankEntries: 1, invoices: 1 });
    expect(result.state.invoices[0]).toMatchObject({ bank_id: f.bill.id, month: "2026-09", closing_date: "2026-09-05", due_date: "2026-09-12", statement_total: 12345 });
    expect(result.state.purchases[0]).toMatchObject({ status: "historical", amount: 1000 });
    expect(result.state.allocations).toEqual([]);
    expect(totals(result.state, filters)).toMatchObject({ total: 12345, unassigned: 0, receivable: 0 });
    expect(personBalance(result.state, result.state.people[0].id).balance).toBe(0);
    expect(chargeRows(result.state, filters)).toHaveLength(1);
    expect(bankRows(result.state, filters)).toHaveLength(1);
    expect(bankRows(result.state, { ...filters, month: "2026-10" })).toHaveLength(0);
    expect(bankRows(result.state, { ...filters, person: result.state.people[0].id })).toHaveLength(0);
    const repeated = importPluggy(result.state, f.data);
    expect(repeated.state.purchases).toHaveLength(1); expect(repeated.state.bank_entries).toHaveLength(1); expect(repeated.state.invoices).toHaveLength(1);
    expect(repeated.counts).toMatchObject({ imported: 0, existing: 2, historical: 0, bankEntries: 0, invoices: 0 });
  });
  it("keeps the cutoff fixed, including Brazil midnight, today and future pending installments", () => {
    const f = fixture(); f.data.batches[0].transactions = [
      { ...f.tx, id: id(), date: "2026-10-18T02:59:59Z" },
      { ...f.tx, id: id(), date: "2026-10-18T03:00:00Z" },
      { ...f.tx, id: id(), date: "2027-01-05", status: "PENDING", creditCardMetadata: { billForecastDate: "2027-02" } },
    ];
    const first = importPluggy(f.state, f.data);
    expect(first.state.purchases.map(p => p.status)).toEqual(["historical", "pending", "pending"]);
    expect(first.state.purchases.map(p => p.purchase_date)).toEqual(["2026-10-17", "2026-10-18", "2027-01-05"]);
    expect(totals(first.state, filters).unassigned).toBe(2000);
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    expect(allocationStartDate(first.state)).toBe("2026-10-18");
    const late = { ...f.tx, id: id(), date: "2026-10-18" };
    f.data.batches[0].transactions = [late];
    expect(importPluggy(first.state, f.data).state.purchases.at(-1)?.status).toBe("pending");
  });
  it("requires a responsible person only for new manual purchases and allows voluntary historical assignment", () => {
    const f = fixture();
    const command = { id: id(), type: "add_purchase", card_id: f.card.id, merchant: "Histórico manual", purchase_date: "2026-10-17", amount: 100, installments: 1, first_month: "2026-11", category_id: null, allocations: [] };
    const historical = applyCommand(f.state, command);
    expect(historical.purchases[0].status).toBe("historical");
    expect(() => applyCommand(f.state, { ...command, id: id(), purchase_date: "2026-10-18" })).toThrow("responsável");
    const assigned = applyCommand(historical, { id: id(), type: "classify", purchase_id: historical.purchases[0].id, category_id: null, allocations: [{ person_id: f.state.people[0].id, amount: 100 }] });
    expect(assigned.purchases[0].status).toBe("confirmed");
    expect(assigned.allocations).toHaveLength(1);
  });
  it("keeps historical CSV purchases without receivables and new CSV purchases pending", () => {
    const f = fixture();
    const row = { merchant: "CSV", purchase_date: "2026-10-17", amount: 100, installments: 1, first_month: "2026-11", external_id: "old" };
    const result = applyCommand(f.state, { id: id(), type: "import", card_id: f.card.id, hash: "a".repeat(64), name: "historico.csv", rows: [row, { ...row, purchase_date: "2026-10-18", external_id: "new" }] });
    expect(result.purchases.map(p => p.status)).toEqual(["historical", "pending"]);
    expect(totals(result, filters)).toMatchObject({ receivable: 0, unassigned: 100 });
  });
  it("moves a forecast installment to its official bill without duplicating it or changing its assigned shares", () => {
    const f = fixture(); f.data.batches[0].transactions = [{ ...f.tx, date: "2026-11-05", creditCardMetadata: { billForecastDate: "2026-12" }, status: "PENDING" }];
    const first = importPluggy(f.state, f.data);
    const assigned = applyCommand(first.state, { id: id(), type: "classify", purchase_id: first.state.purchases[0].id, category_id: null, allocations: [{ person_id: f.state.people[0].id, amount: 1000 }] });
    const bill = { ...f.bill, id: id(), dueDate: "2026-11-12", billClosingDate: "2026-11-05" };
    f.data.batches[0].bills.push(bill);
    f.data.batches[0].transactions[0] = { ...f.data.batches[0].transactions[0], status: "POSTED", creditCardMetadata: { billId: bill.id } };
    const second = importPluggy(assigned, f.data);
    expect(second.state.purchases).toEqual(assigned.purchases);
    expect(second.state.allocations).toEqual(assigned.allocations);
    const invoice = second.state.invoices.find(i => i.id === second.state.charges[0].invoice_id)!;
    expect(invoice.bank_id).toBe(bill.id); expect(invoice.month).toBe("2026-11");
  });
  it("preserves skipped historical and pending purchases on repeated syncs and after voluntary assignment", () => {
    const f = fixture();
    f.data.batches[0].transactions.push({ ...f.tx, id: id(), date: "2026-10-18" });
    const first = importPluggy(f.state, f.data);
    const skipped = first.state.purchases.reduce((state, purchase) => applyCommand(state, { id: id(), type: "skip_assignment", purchase_id: purchase.id }), first.state);
    const repeated = importPluggy(skipped, f.data);
    expect(repeated.state.purchases).toEqual(skipped.purchases);
    expect(repeated.state.allocations).toEqual([]);
    expect(repeated.counts).toMatchObject({ imported: 0, existing: 2 });
    const assigned = applyCommand(repeated.state, { id: id(), type: "classify", purchase_id: repeated.state.purchases[0].id, category_id: null, allocations: [{ person_id: f.state.people[0].id, amount: 1000 }] });
    const synced = importPluggy(assigned, f.data);
    expect(synced.state.purchases).toEqual(assigned.purchases);
    expect(synced.state.allocations).toEqual(assigned.allocations);
  });
  it("imports without inventing absent billing dates and rejects invalid bank invoice links", () => {
    const f = fixture(); f.data.batches[0].bills = [];
    f.card.closing_day = null; f.card.due_day = null;
    f.data.batches[0].transactions[0].creditCardMetadata = { billForecastDate: "2026-09" };
    const result = importPluggy(f.state, f.data);
    expect(result.state.invoices[0]).toMatchObject({ closing_date: null, due_date: null, bank_id: null });
    expect(result.state.purchases[0].status).toBe("historical");
    const other = { ...result.state.invoices[0], card_id: id() };
    expect(() => addPurchase(result.state, { card_id: f.card.id, merchant: "Invalid", purchase_date: "2026-10-18", amount: 100, installments: 1, first_month: other.month, category_id: null }, undefined, other)).toThrow("incompatível");
    const before = structuredClone(f.state);
    f.data.batches[0].transactions.push({ ...f.tx, id: id(), amount: 0.001 });
    expect(() => importPluggy(f.state, f.data)).toThrow();
    expect(f.state).toEqual(before);
  });
});
