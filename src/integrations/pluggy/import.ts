import { z } from "zod";
import { addPurchase, allocationStartDate, hasBillingDates, inheritInstallmentAssignments, suggestedMonth } from "../../lib/finance/engine";
import { addMonths, brazilDate, cents, monthDate } from "../../lib/finance/money";
import { dateSchema, importRowSchema, monthSchema } from "../../lib/finance/schema";
import type { Card, FinanceState } from "../../lib/finance/types";

const bankDate = z.union([z.iso.date(), z.iso.datetime({ offset: true, local: true })]);
export const billSchema = z.object({
  id: z.uuid(), dueDate: bankDate, billClosingDate: bankDate.nullish(),
  totalAmount: z.number().finite(), totalAmountCurrencyCode: z.literal("BRL"),
});
export const transactionSchema = z.object({
  id: z.string().min(1).max(200), accountId: z.uuid(),
  description: z.string(), date: z.union([z.iso.date(), z.iso.datetime({ offset: true })]),
  amount: z.number().finite(), amountInAccountCurrency: z.number().finite().nullish(), currencyCode: z.string(), type: z.string().min(1).max(40), status: z.string().min(1).max(40),
  operationType: z.string().nullish(),
  creditCardMetadata: z.object({ billId: z.uuid().nullish(), billForecastDate: monthSchema.nullish(),
    installmentNumber: z.number().int().min(1).max(120).nullish(), totalInstallments: z.number().int().min(1).max(120).nullish(), purchaseDate: bankDate.nullish() }).nullish(),
});
export type BankTransaction = z.infer<typeof transactionSchema>;
export type BankBill = z.infer<typeof billSchema>;
export type BankBatch = { card: Card; transactions: BankTransaction[]; bills: BankBill[] };
export type PluggyData = { batches: BankBatch[]; ignoredCards: number; warnings: string[] };
export type SyncCounts = { imported: number; existing: number; changed: number; similar: number; ignored: number; registeredCards: number; incompleteCards: number; ignoredCards: number; historical: number; bankEntries: number; invoices: number };

export function importPluggy(input: FinanceState, data: PluggyData) {
  const state = structuredClone(input);
  state.bank_entries ??= [];
  const startDate = allocationStartDate(input);
  const counts: SyncCounts = { imported: 0, existing: 0, changed: 0, similar: 0, ignored: 0, registeredCards: 0, incompleteCards: 0, ignoredCards: data.ignoredCards, historical: 0, bankEntries: 0, invoices: 0 };
  const importedIds = new Set<string>();
  for (const batch of data.batches) {
    const existing = state.cards.find(c => c.id === batch.card.id);
    if (existing) {
      existing.closing_day ??= batch.card.closing_day;
      existing.due_day ??= batch.card.due_day;
    } else {
      state.cards.push({ ...batch.card });
      counts.registeredCards++;
    }
  }
  const sources = new Map(state.sources.filter(s => s.source_type === "pluggy").map(s => [s.card_id + ":" + s.external_id, s]));
  const purchases = new Map(state.purchases.map(p => [p.id, p]));
  const entries = new Map(state.bank_entries.map(e => [e.card_id + ":" + e.external_id, e]));
  const bankPurchases = new Set([...sources.values()].map(s => s.purchase_id));
  const invoices = new Map(state.invoices.map(i => [i.id, i]));
  const manualDates = new Set(input.purchases.filter(p => !bankPurchases.has(p.id)).map(p => p.card_id + ":" + p.purchase_date + ":" + p.amount));
  const manualMonths = new Set(input.charges.filter(c => c.kind === "purchase" && !bankPurchases.has(c.purchase_id)).map(c => {
    const invoice = invoices.get(c.invoice_id)!;
    return invoice.card_id + ":" + invoice.month + ":" + c.amount;
  }));
  for (const batch of data.batches) {
    const card = state.cards.find(c => c.id === batch.card.id)!;
    if (!hasBillingDates(card)) counts.incompleteCards++;
    for (const rawBill of batch.bills) {
      const bill = billSchema.parse(rawBill);
      const month = monthSchema.parse(bill.dueDate.slice(0, 7));
      let invoice = state.invoices.find(i => i.card_id === card.id && i.month === month);
      if (!invoice) {
        if (invoices.has(bill.id)) throw new Error("A fatura pertence a outro cartão.");
        invoice = { id: bill.id, card_id: card.id, month, bank_id: bill.id, closing_date: null, due_date: null, statement_total: null, paid_at: null };
        state.invoices.push(invoice); invoices.set(invoice.id, invoice); counts.invoices++;
      }
      if (invoice.bank_id && invoice.bank_id !== bill.id) throw new Error("Mais de uma fatura bancária no mesmo mês.");
      invoice.bank_id = bill.id;
      invoice.due_date = bill.dueDate.slice(0, 10);
      invoice.closing_date = bill.billClosingDate?.slice(0, 10) ?? invoice.closing_date;
      // Pluggy bill totals can have fractional cents; BRL statements display two decimal places.
      invoice.statement_total ??= cents(bill.totalAmount.toLocaleString("en-US", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
    function invoiceForTransaction(tx: BankTransaction, date: string) {
      const billId = tx.creditCardMetadata?.billId;
      const linked = billId ? state.invoices.find(i => i.bank_id === billId) : undefined;
      if (linked) {
        if (linked.card_id !== card.id) throw new Error("A transação indica uma fatura de outro cartão.");
        return linked;
      }
      const month = tx.creditCardMetadata?.billForecastDate ?? (hasBillingDates(card) ? suggestedMonth(date, card) : date.slice(0, 7));
      let invoice = state.invoices.find(i => i.card_id === card.id && i.month === month);
      if (!invoice) {
        invoice = { id: crypto.randomUUID(), card_id: card.id, month, bank_id: null,
          due_date: card.due_day === null ? null : monthDate(month, card.due_day),
          closing_date: hasBillingDates(card) ? monthDate(addMonths(month, card.due_day <= card.closing_day ? -1 : 0), card.closing_day) : null,
          statement_total: null, paid_at: null };
        state.invoices.push(invoice); invoices.set(invoice.id, invoice);
      }
      return invoice;
    }
    for (const raw of batch.transactions) {
      const tx = transactionSchema.parse(raw);
      if (tx.accountId !== card.id) throw new Error("A transação pertence a outra conta bancária.");
      const date = dateSchema.parse(brazilDate(tx.date));
      const merchant = tx.description.trim().slice(0, 160);
      const amount = tx.currencyCode === "BRL" ? tx.amount : tx.amountInAccountCurrency;
      const eligible = tx.type === "DEBIT" && ["POSTED", "PENDING"].includes(tx.status) && amount != null && amount > 0
        && !["PAGAMENTO_FATURA", "ESTORNO", "CASHBACK"].includes(tx.operationType || "");
      const source = sources.get(card.id + ":" + tx.id);
      const metadata = tx.creditCardMetadata;
      const installment = metadata?.installmentNumber && metadata.totalInstallments && metadata.totalInstallments > 1 && metadata.installmentNumber <= metadata.totalInstallments && metadata.purchaseDate
        ? { installment_no: metadata.installmentNumber, installment_count: metadata.totalInstallments, original_purchase_date: new Date(metadata.purchaseDate).toISOString() } : null;
      if (source) {
        if (installment) Object.assign(source, installment);
        const purchase = purchases.get(source.purchase_id)!;
        if (purchase.status === "pending" && purchase.purchase_date < startDate) purchase.status = "historical";
        if (!eligible || purchase.amount !== cents(String(amount)) || purchase.purchase_date !== date || purchase.merchant !== merchant) counts.changed++;
        else {
          counts.existing++;
          if (tx.creditCardMetadata?.billId) {
            const invoice = invoiceForTransaction(tx, date);
            const charge = state.charges.find(c => c.purchase_id === purchase.id && c.kind === "purchase");
            if (charge) charge.invoice_id = invoice.id;
          }
        }
        continue;
      }
      if (amount == null || !["POSTED", "PENDING"].includes(tx.status)) { counts.ignored++; continue; }
      const invoice = invoiceForTransaction(tx, date);
      if (!eligible) {
        const key = card.id + ":" + tx.id;
        const fields = { card_id: card.id, invoice_id: invoice.id, external_id: tx.id, merchant, date,
          amount: tx.type === "CREDIT" ? -Math.abs(cents(String(amount))) : cents(String(amount)), type: tx.type, status: tx.status };
        const existing = entries.get(key);
        if (existing) { Object.assign(existing, fields); counts.existing++; }
        else {
          const entry = { id: crypto.randomUUID(), ...fields };
          state.bank_entries.push(entry); entries.set(key, entry); counts.bankEntries++;
        }
        continue;
      }
      const row = importRowSchema.parse({ merchant, purchase_date: date, amount: cents(String(amount)), installments: 1,
        first_month: invoice.month, external_id: tx.id });
      const similar = manualDates.has(card.id + ":" + date + ":" + row.amount)
        || manualMonths.has(card.id + ":" + row.first_month + ":" + row.amount);
      if (similar) { counts.similar++; continue; }
      const purchase = addPurchase(state, { card_id: card.id, merchant: row.merchant, purchase_date: row.purchase_date,
        amount: row.amount, installments: 1, first_month: row.first_month, category_id: null }, undefined, invoice);
      state.sources.push({ id: crypto.randomUUID(), purchase_id: purchase.id, card_id: card.id,
        source_type: "pluggy", external_id: tx.id, import_id: null, ...installment });
      importedIds.add(purchase.id);
      sources.set(card.id + ":" + tx.id, state.sources.at(-1)!);
      purchases.set(purchase.id, purchase);
      if (purchase.status === "historical") counts.historical++;
      counts.imported++;
    }
  }
  inheritInstallmentAssignments(state, importedIds);
  state.audit.push({ id: crypto.randomUUID(), action: "pluggy_sync", created_at: new Date().toISOString() });
  state.revision++;
  return { state, counts, warnings: data.warnings, allocationStartDate: startDate };
}
