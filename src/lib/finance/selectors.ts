import type { Charge, FinanceState, Filters } from "./types";
import { addMonths, distribute, monthLabel } from "./money";
import { personBalance } from "./engine";

// Each installment consumes remaining shares; the last one settles every cent.
export function chargeShares(state: FinanceState, charge: Charge) {
  const shares = state.allocations.filter(a => a.purchase_id === charge.purchase_id);
  if (charge.kind === "refund") return shares.map(a => ({ person_id: a.person_id, amount: -state.refund_allocations.filter(r => r.refund_id === charge.refund_id && r.allocation_id === a.id).reduce((s, r) => s + r.amount, 0) }));
  const remaining = shares.map(a => a.amount);
  const installments = state.charges.filter(c => c.purchase_id === charge.purchase_id && c.kind === "purchase" && c.installment_no <= charge.installment_no).sort((a, b) => a.installment_no - b.installment_no);
  let amounts = remaining.map(() => 0);
  for (const installment of installments) {
    amounts = distribute(installment.amount, remaining);
    amounts.forEach((amount, i) => { remaining[i] -= amount; });
  }
  return shares.map((a, i) => ({ person_id: a.person_id, amount: amounts[i] }));
}
export function chargeRows(state: FinanceState, filters: Filters, ignoreMonth = false) {
  return state.charges.flatMap(charge => {
    const purchase = state.purchases.find(p => p.id === charge.purchase_id)!;
    const card = state.cards.find(c => c.id === purchase.card_id)!;
    const invoice = state.invoices.find(i => i.id === charge.invoice_id)!;
    const shares = chargeShares(state, charge);
    if ((!ignoreMonth && invoice.month !== filters.month) || (filters.bank && card.institution_id !== filters.bank) || (filters.card && card.id !== filters.card) || (filters.category && purchase.category_id !== filters.category) || (filters.person && !shares.some(a => a.person_id === filters.person)) || (filters.search && !purchase.merchant.toLocaleLowerCase().includes(filters.search.toLocaleLowerCase()))) return [];
    const selected = filters.person ? shares.filter(a => a.person_id === filters.person) : shares;
    const owner = state.people.find(p => p.is_owner)?.id;
    const own = selected.filter(a => a.person_id === owner).reduce((s, a) => s + a.amount, 0);
    const others = selected.filter(a => a.person_id !== owner).reduce((s, a) => s + a.amount, 0);
    return [{ charge, purchase, card, invoice, shares, own, others, amount: filters.person ? own + others : charge.amount }];
  }).sort((a, b) => b.purchase.purchase_date.localeCompare(a.purchase.purchase_date) || a.purchase.merchant.localeCompare(b.purchase.merchant));
}
export function totals(state: FinanceState, filters: Filters) {
  const rows = chargeRows(state, filters);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const own = rows.reduce((s, r) => s + r.own, 0);
  const others = rows.reduce((s, r) => s + r.others, 0);
  const receivable = state.people.filter(p => !p.is_owner).reduce((s, p) => s + Math.max(0, personBalance(state, p.id).balance), 0);
  return { total, own, others, unassigned: total - own - others, receivable };
}
export function forecast(state: FinanceState, filters: Filters) {
  return Array.from({ length: 6 }, (_, i) => {
    const month = addMonths(filters.month, i);
    const sum = totals(state, { ...filters, month });
    return { month: monthLabel(month, true), propria: sum.own / 100, terceiros: sum.others / 100, pendente: sum.unassigned / 100 };
  });
}
