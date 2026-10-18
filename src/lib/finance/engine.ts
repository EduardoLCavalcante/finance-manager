import type { Allocation, Card, FinanceState, Invoice, Purchase } from "./types";
import { addMonths, distribute, monthDate, splitEvenly } from "./money";
import { commandSchema, type Command, type ImportRow } from "./schema";

const uuid = () => crypto.randomUUID();
export function emptyState(): FinanceState {
  return { revision: 0, cards: [], people: [{ id: uuid(), name: "Eu", is_owner: true }], categories: ["Alimentação", "Compras", "Eletrônicos", "Saúde", "Transporte", "Casa", "Lazer", "Serviços"].map(name => ({ id: uuid(), name })), purchases: [], invoices: [], charges: [], allocations: [], refunds: [], refund_allocations: [], reimbursements: [], reimbursement_allocations: [], sources: [], imports: [], audit: [] };
}
function required<T>(item: T | undefined, message = "Registro não encontrado."): T { if (!item) throw new Error(message); return item; }
export function suggestedMonth(date: string, card: Card) {
  const month = date.slice(0, 7);
  const closed = date > monthDate(month, card.closing_day);
  return addMonths(month, (closed ? 1 : 0) + (card.due_day <= card.closing_day ? 1 : 0));
}
function invoiceFor(state: FinanceState, card: Card, month: string): Invoice {
  let invoice = state.invoices.find(i => i.card_id === card.id && i.month === month);
  if (!invoice) {
    invoice = { id: uuid(), card_id: card.id, month, due_date: monthDate(month, card.due_day), closing_date: monthDate(addMonths(month, card.due_day <= card.closing_day ? -1 : 0), card.closing_day), statement_total: null, paid_at: null };
    state.invoices.push(invoice);
  }
  return invoice;
}
function allocate(state: FinanceState, purchase: Purchase, shares: { person_id: string; amount: number }[]) {
  if (new Set(shares.map(s => s.person_id)).size !== shares.length) throw new Error("Cada responsável deve aparecer uma única vez.");
  if (shares.reduce((s, a) => s + a.amount, 0) !== purchase.amount) throw new Error("A divisão deve somar exatamente o valor da compra.");
  shares.forEach(share => {
    required(state.people.find(p => p.id === share.person_id), "Responsável não encontrado.");
    state.allocations.push({ id: uuid(), purchase_id: purchase.id, ...share });
  });
  purchase.status = "confirmed";
}
function addPurchase(state: FinanceState, data: { card_id: string; merchant: string; purchase_date: string; amount: number; installments: number; first_month: string; category_id: string | null }, shares?: { person_id: string; amount: number }[]) {
  const card = required(state.cards.find(c => c.id === data.card_id), "Cadastre um cartão primeiro.");
  if (data.category_id) required(state.categories.find(c => c.id === data.category_id), "Categoria não encontrada.");
  if (data.amount < data.installments) throw new Error("O valor não pode gerar parcelas menores que um centavo.");
  if (data.first_month < data.purchase_date.slice(0, 7)) throw new Error("A primeira fatura não pode ser anterior à compra.");
  const { first_month, ...fields } = data;
  const purchase: Purchase = { id: uuid(), ...fields, status: "pending" };
  state.purchases.push(purchase);
  splitEvenly(data.amount, data.installments).forEach((amount, i) => {
    const invoice = invoiceFor(state, card, addMonths(first_month, i));
    state.charges.push({ id: uuid(), purchase_id: purchase.id, invoice_id: invoice.id, amount, installment_no: i + 1, kind: "purchase", refund_id: null });
  });
  if (shares) allocate(state, purchase, shares);
  return purchase;
}
export function allocationBalance(state: FinanceState, allocation: Allocation) {
  const refunds = state.refund_allocations.filter(a => a.allocation_id === allocation.id).reduce((sum, a) => sum + a.amount, 0);
  const paid = state.reimbursement_allocations.filter(a => a.allocation_id === allocation.id).reduce((sum, a) => sum + a.amount, 0);
  return { original: allocation.amount, refunds, paid, net: allocation.amount - refunds, balance: allocation.amount - refunds - paid };
}
export function personBalance(state: FinanceState, personId: string) {
  return state.allocations.filter(a => a.person_id === personId).reduce((sum, a) => {
    const b = allocationBalance(state, a);
    return { original: sum.original + b.original, refunds: sum.refunds + b.refunds, paid: sum.paid + b.paid, balance: sum.balance + b.balance };
  }, { original: 0, refunds: 0, paid: 0, balance: 0 });
}
export function similarPurchase(state: FinanceState, cardId: string, row: ImportRow) {
  return state.purchases.find(p => p.card_id === cardId && p.amount === row.amount && p.purchase_date === row.purchase_date && p.merchant.trim().toLocaleLowerCase() === row.merchant.trim().toLocaleLowerCase());
}
export function applyCommand(input: FinanceState, raw: unknown): FinanceState {
  const command: Command = commandSchema.parse(raw);
  if (input.audit.some(a => a.id === command.id)) return input;
  const state = structuredClone(input);
  switch (command.type) {
    case "add_card": {
      if (state.cards.some(c => c.institution_id === command.institution_id && c.last_four === command.last_four && c.name === command.name)) throw new Error("Este cartão já está cadastrado.");
      state.cards.push({ id: uuid(), institution_id: command.institution_id, name: command.name, last_four: command.last_four, closing_day: command.closing_day, due_day: command.due_day });
      break;
    }
    case "add_person":
    case "add_category": {
      const list = command.type === "add_person" ? state.people : state.categories;
      if (list.some(p => p.name.toLocaleLowerCase() === command.name.toLocaleLowerCase())) throw new Error("Este nome já está cadastrado.");
      if (command.type === "add_person") state.people.push({ id: uuid(), name: command.name, is_owner: false });
      else state.categories.push({ id: uuid(), name: command.name });
      break;
    }
    case "add_purchase": {
      const purchase = addPurchase(state, command, command.allocations);
      state.sources.push({ id: uuid(), purchase_id: purchase.id, card_id: purchase.card_id, source_type: "manual", external_id: command.id, import_id: null });
      break;
    }
    case "classify": {
      const purchase = required(state.purchases.find(p => p.id === command.purchase_id));
      if (purchase.status !== "pending") throw new Error("Esta compra já foi atribuída.");
      if (command.category_id) required(state.categories.find(c => c.id === command.category_id));
      purchase.category_id = command.category_id;
      allocate(state, purchase, command.allocations);
      break;
    }
    case "refund": {
      const purchase = required(state.purchases.find(p => p.id === command.purchase_id));
      if (purchase.status !== "confirmed") throw new Error("Atribua a compra antes de registrar o estorno.");
      if (command.received_at < purchase.purchase_date || command.month < purchase.purchase_date.slice(0, 7)) throw new Error("O estorno não pode ser anterior à compra.");
      const already = state.refunds.filter(r => r.purchase_id === purchase.id).reduce((s, r) => s + r.amount, 0);
      if (command.amount > purchase.amount - already) throw new Error("O estorno excede o valor restante da compra.");
      const refund = { id: uuid(), purchase_id: purchase.id, amount: command.amount, received_at: command.received_at, reason: command.reason };
      state.refunds.push(refund);
      const allocations = state.allocations.filter(a => a.purchase_id === purchase.id);
      const weights = allocations.map(a => allocationBalance(state, a).net);
      distribute(command.amount, weights).forEach((amount, i) => {
        if (amount) state.refund_allocations.push({ id: uuid(), refund_id: refund.id, allocation_id: allocations[i].id, amount });
      });
      const invoice = invoiceFor(state, required(state.cards.find(c => c.id === purchase.card_id)), command.month);
      state.charges.push({ id: uuid(), purchase_id: purchase.id, invoice_id: invoice.id, amount: -command.amount, installment_no: 0, kind: "refund", refund_id: refund.id });
      break;
    }
    case "reimburse": {
      const person = required(state.people.find(p => p.id === command.person_id));
      if (person.is_owner) throw new Error("Reembolsos são recebimentos de terceiros.");
      if (command.amount > personBalance(state, person.id).balance) throw new Error("O pagamento excede o saldo pendente desta pessoa.");
      const candidates = state.allocations.filter(a => a.person_id === person.id && required(state.purchases.find(p => p.id === a.purchase_id)).purchase_date <= command.received_at)
        .sort((a, b) => required(state.purchases.find(p => p.id === a.purchase_id)).purchase_date.localeCompare(required(state.purchases.find(p => p.id === b.purchase_id)).purchase_date));
      const reimbursement = { id: uuid(), person_id: person.id, amount: command.amount, received_at: command.received_at, note: command.note };
      state.reimbursements.push(reimbursement);
      let remaining = command.amount;
      for (const allocation of candidates) {
        const amount = Math.min(remaining, Math.max(0, allocationBalance(state, allocation).balance));
        if (amount) state.reimbursement_allocations.push({ id: uuid(), reimbursement_id: reimbursement.id, allocation_id: allocation.id, amount });
        remaining -= amount;
        if (!remaining) break;
      }
      if (remaining) throw new Error("Não há despesas suficientes anteriores à data do pagamento.");
      break;
    }
    case "statement": {
      const invoice = required(state.invoices.find(i => i.id === command.invoice_id));
      invoice.statement_total = command.statement_total;
      invoice.paid_at = command.paid_at;
      break;
    }
    case "import": {
      required(state.cards.find(c => c.id === command.card_id));
      if (state.imports.some(i => i.card_id === command.card_id && i.hash === command.hash)) throw new Error("Este arquivo já foi importado neste cartão.");
      const file = { id: uuid(), card_id: command.card_id, hash: command.hash, name: command.name, created_at: new Date().toISOString(), row_count: 0 };
      command.rows.forEach((row, index) => {
        const externalId = row.external_id || `${command.hash}:${index}`;
        if (state.sources.some(s => s.card_id === command.card_id && s.source_type === "csv" && s.external_id === externalId)) return;
        if (similarPurchase(input, command.card_id, row) && !row.allow_similar) throw new Error(`Revise a possível duplicidade: ${row.merchant}.`);
        const purchase = addPurchase(state, { ...row, card_id: command.card_id, category_id: null });
        state.sources.push({ id: uuid(), card_id: command.card_id, purchase_id: purchase.id, source_type: "csv", external_id: externalId, import_id: file.id });
        file.row_count++;
      });
      if (!file.row_count) throw new Error("Todas as transações deste arquivo já foram importadas.");
      state.imports.push(file);
      break;
    }
  }
  state.audit.push({ id: command.id, action: command.type, created_at: new Date().toISOString() });
  state.revision++;
  return state;
}
