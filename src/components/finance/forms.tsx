"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, FieldLabel, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { banks, type FinanceState, type Purchase } from "@/lib/finance/types";
import { cents, inputMoney, money, today } from "@/lib/finance/money";
import { personBalance, suggestedMonth } from "@/lib/finance/engine";
import { ImportForm } from "./import-form";

export type Modal = { kind: "purchase" | "card" | "person" | "category" | "reimbursement" | "refund" | "classify" | "statement" | "import"; id?: string };
type Submit = (command: Record<string, unknown>) => Promise<void>;
const titles: Record<Modal["kind"], [string, string]> = {
  purchase: ["Nova compra", "Registre o valor total e escolha quem participa desta despesa."],
  card: ["Adicionar cartão", "Informe apenas os quatro últimos dígitos do cartão."],
  person: ["Novo responsável", "Cadastre alguém que compartilha despesas com você."],
  category: ["Nova categoria", "Organize suas compras por tipo de despesa."],
  reimbursement: ["Registrar reembolso", "O valor será aplicado às despesas mais antigas desta pessoa."],
  refund: ["Registrar estorno", "O crédito será dividido proporcionalmente entre os responsáveis, preservando o histórico."],
  classify: ["Atribuir compra", "Confirme a categoria e os responsáveis pela compra importada."],
  statement: ["Conferir fatura", "Compare os lançamentos com o total informado pelo banco."],
  import: ["Importar compras", "Envie um CSV no modelo indicado e revise antes de confirmar."],
};
export function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <Field><FieldLabel>{label}{children}</FieldLabel>{hint ? <FieldDescription>{hint}</FieldDescription> : null}</Field>;
}
function Footer({ label = "Salvar" }: { label?: string }) { const { saving } = useFinance(); return <div className="form-footer"><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : null}{saving ? "Salvando…" : label}</Button></div>; }
function formValues(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return new FormData(event.currentTarget); }
export function FinanceDialog({ modal, onClose }: { modal: Modal | null; onClose: () => void }) {
  const { state, mutate, saving } = useFinance();
  const [error, setError] = useState("");
  if (!modal || !state) return null;
  const submit: Submit = async command => { setError(""); try { await mutate(command); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "Confira os dados."); } };
  const safe = (fn: () => Promise<void> | void) => { setError(""); try { const pending = fn(); if (pending) void pending.catch(e => setError(e.message)); } catch (e) { setError(e instanceof Error ? e.message : "Confira os dados."); } };
  const props = { state, submit, safe };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className={modal.kind === "import" ? "finance-dialog wide-dialog" : "finance-dialog"} onInteractOutside={e => { if (saving) e.preventDefault(); }}><DialogHeader><DialogTitle>{titles[modal.kind][0]}</DialogTitle><DialogDescription>{titles[modal.kind][1]}</DialogDescription></DialogHeader>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {(modal.kind === "purchase" || modal.kind === "classify") ? <PurchaseForm {...props} purchase={state.purchases.find(p => p.id === modal.id)} /> : null}
    {modal.kind === "import" ? <ImportForm state={state} submit={submit} /> : null}
    {modal.kind === "card" ? <form onSubmit={e => { const d = formValues(e); safe(() => submit({ type: "add_card", institution_id: d.get("bank"), name: d.get("name"), last_four: d.get("last_four"), closing_day: Number(d.get("closing_day")), due_day: Number(d.get("due_day")) })); }}><FieldGroup>
      <FormField label="Banco"><select name="bank">{Object.entries(banks).map(([id, b]) => <option key={id} value={id}>{b.name}</option>)}</select></FormField>
      <FormField label="Nome do cartão"><Input name="name" placeholder="Ex.: Nubank Platinum" required maxLength={160} /></FormField>
      <FormField label="Últimos quatro dígitos"><Input name="last_four" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="1234" required /></FormField>
      <div className="form-grid"><FormField label="Dia de fechamento"><Input name="closing_day" type="number" min={1} max={31} defaultValue={24} required /></FormField><FormField label="Dia de vencimento"><Input name="due_day" type="number" min={1} max={31} defaultValue={1} required /></FormField></div>
    </FieldGroup><Footer label="Adicionar cartão" /></form> : null}
    {(modal.kind === "person" || modal.kind === "category") ? <form onSubmit={e => { const d = formValues(e); safe(() => submit({ type: modal.kind === "person" ? "add_person" : "add_category", name: d.get("name") })); }}><FieldGroup><FormField label="Nome"><Input name="name" required maxLength={160} autoFocus /></FormField></FieldGroup><Footer /></form> : null}
    {modal.kind === "reimbursement" ? <ReimbursementForm {...props} personId={modal.id} /> : null}
    {modal.kind === "refund" ? <RefundForm {...props} purchaseId={modal.id!} /> : null}
    {modal.kind === "statement" ? <StatementForm {...props} invoiceId={modal.id!} /> : null}
  </DialogContent></Dialog>;
}
type FormProps = { state: FinanceState; submit: Submit; safe: (fn: () => Promise<void> | void) => void };
function PurchaseForm({ state, submit, safe, purchase }: FormProps & { purchase?: Purchase }) {
  const [cardId, setCardId] = useState(purchase?.card_id ?? state.cards[0]?.id ?? "");
  const [date, setDate] = useState(purchase?.purchase_date ?? today());
  const [amount, setAmount] = useState(purchase ? inputMoney(purchase.amount) : "");
  const [responsible, setResponsible] = useState(state.people.find(p => p.is_owner)?.id ?? "");
  const [shares, setShares] = useState<Record<string, string>>({});
  const [firstMonth, setFirstMonth] = useState(state.cards[0] ? suggestedMonth(today(), state.cards[0]) : today().slice(0, 7));
  let total = 0, allocated = 0;
  try { total = amount ? cents(amount) : 0; allocated = Object.values(shares).reduce((s, n) => s + (n ? cents(n) : 0), 0); } catch { /* Submission presents invalid amounts. */ }
  if (!state.cards.length && !purchase) return <p className="empty-note">Cadastre um cartão em “Cartões” antes de registrar uma compra.</p>;
  return <form onSubmit={e => { const d = formValues(e); safe(() => {
    const allocations = responsible === "shared" ? Object.entries(shares).filter(([, v]) => v && cents(v) > 0).map(([person_id, v]) => ({ person_id, amount: cents(v) })) : [{ person_id: responsible, amount: cents(amount) }];
    const common = { category_id: d.get("category") || null, allocations };
    return submit(purchase ? { type: "classify", purchase_id: purchase.id, ...common } : { type: "add_purchase", card_id: cardId, merchant: d.get("merchant"), purchase_date: date, amount: cents(amount), installments: Number(d.get("installments")), first_month: firstMonth, ...common });
  }); }}><FieldGroup>
    {purchase ? <div className="purchase-summary"><strong>{purchase.merchant}</strong><span>{money(purchase.amount)}</span></div> : <>
      <FormField label="Estabelecimento"><Input name="merchant" placeholder="Onde você comprou?" maxLength={160} required autoFocus /></FormField>
      <div className="form-grid"><FormField label="Valor total (R$)"><Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" required /></FormField><FormField label="Data da compra"><Input type="date" value={date} onChange={e => { setDate(e.target.value); if (e.target.value) setFirstMonth(suggestedMonth(e.target.value, state.cards.find(c => c.id === cardId)!)); }} min="2000-01-01" max="2099-12-31" required /></FormField></div>
      <FormField label="Cartão"><select value={cardId} onChange={e => { setCardId(e.target.value); setFirstMonth(suggestedMonth(date, state.cards.find(c => c.id === e.target.value)!)); }} required>{state.cards.map(c => <option key={c.id} value={c.id}>{c.name} · {c.last_four}</option>)}</select></FormField>
      <div className="form-grid"><FormField label="Número de parcelas"><Input type="number" name="installments" min={1} max={120} defaultValue={1} required /></FormField><FormField label="Primeira fatura" hint="Mês de vencimento; ajuste conforme o banco."><Input type="month" value={firstMonth} min={date.slice(0, 7)} max="2099-12" onChange={e => setFirstMonth(e.target.value)} required /></FormField></div>
    </>}
    <FormField label="Categoria"><select name="category" defaultValue={purchase?.category_id ?? ""}><option value="">Sem categoria</option>{state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
    <FormField label="Quem paga esta compra?"><select value={responsible} onChange={e => setResponsible(e.target.value)}>{state.people.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_owner ? " (minha despesa)" : ""}</option>)}<option value="shared">Compartilhar entre responsáveis</option></select></FormField>
    {responsible === "shared" ? <fieldset className="shares"><legend>Parte de cada pessoa no valor total</legend>{state.people.map(p => <FormField key={p.id} label={p.name}><Input inputMode="decimal" aria-label={`Parte de ${p.name}`} placeholder="0,00" value={shares[p.id] ?? ""} onChange={e => setShares({ ...shares, [p.id]: e.target.value })} /></FormField>)}<p className={total === allocated ? "text-green" : "text-muted"}>Distribuído: {money(allocated)} de {money(total)}</p></fieldset> : null}
  </FieldGroup><Footer label={purchase ? "Confirmar atribuição" : "Registrar compra"} /></form>;
}
function ReimbursementForm({ state, submit, safe, personId }: FormProps & { personId?: string }) {
  const people = state.people.filter(p => !p.is_owner);
  const [selected, setSelected] = useState(personId ?? people[0]?.id ?? "");
  return <form onSubmit={e => { const d = formValues(e); safe(() => submit({ type: "reimburse", person_id: selected, amount: cents(String(d.get("amount"))), received_at: d.get("date"), note: d.get("note") })); }}><FieldGroup>
    <FormField label="Quem pagou?"><select required value={selected} onChange={e => setSelected(e.target.value)}><option value="" disabled>Selecione um responsável</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
    <p className="balance-note">Saldo pendente: <strong>{money(personBalance(state, selected).balance)}</strong></p>
    <div className="form-grid"><FormField label="Valor recebido (R$)"><Input name="amount" inputMode="decimal" placeholder="0,00" required /></FormField><FormField label="Data do recebimento"><Input name="date" type="date" defaultValue={today()} required /></FormField></div>
    <FormField label="Observação (opcional)"><Input name="note" placeholder="Ex.: Pix" maxLength={300} /></FormField>
  </FieldGroup><Footer label="Registrar recebimento" /></form>;
}
function RefundForm({ state, submit, safe, purchaseId }: FormProps & { purchaseId: string }) {
  const purchase = state.purchases.find(p => p.id === purchaseId)!;
  const refunded = state.refunds.filter(r => r.purchase_id === purchaseId).reduce((s, r) => s + r.amount, 0);
  return <form onSubmit={e => { const d = formValues(e); safe(() => submit({ type: "refund", purchase_id: purchaseId, amount: cents(String(d.get("amount"))), received_at: d.get("date"), month: d.get("month"), reason: d.get("reason") })); }}><FieldGroup>
    <div className="purchase-summary"><strong>{purchase.merchant}</strong><span>Disponível: {money(purchase.amount - refunded)}</span></div>
    <FormField label="Valor estornado (R$)"><Input name="amount" inputMode="decimal" required placeholder="0,00" /></FormField>
    <div className="form-grid"><FormField label="Data do estorno"><Input name="date" type="date" defaultValue={today()} min={purchase.purchase_date} required /></FormField><FormField label="Fatura que recebe o crédito"><Input name="month" type="month" defaultValue={today().slice(0, 7)} min={purchase.purchase_date.slice(0, 7)} required /></FormField></div>
    <FormField label="Motivo"><Input name="reason" placeholder="Ex.: devolução do produto" required maxLength={160} /></FormField>
    <p className="text-muted">As parcelas originais são mantidas; o estorno aparece como crédito na fatura escolhida. Se a pessoa já reembolsou, o saldo poderá indicar um valor a devolver.</p>
  </FieldGroup><Footer label="Registrar estorno" /></form>;
}
function StatementForm({ state, submit, safe, invoiceId }: FormProps & { invoiceId: string }) {
  const invoice = state.invoices.find(i => i.id === invoiceId)!;
  const total = state.charges.filter(c => c.invoice_id === invoice.id).reduce((s, c) => s + c.amount, 0);
  return <form onSubmit={e => { const d = formValues(e); safe(() => submit({ type: "statement", invoice_id: invoiceId, statement_total: d.get("total") ? cents(String(d.get("total"))) : null, paid_at: d.get("paid") || null })); }}><FieldGroup>
    <p>Total dos lançamentos: <strong>{money(total)}</strong></p>
    <FormField label="Total no extrato do banco (R$)"><Input name="total" inputMode="decimal" defaultValue={invoice.statement_total === null ? "" : inputMoney(invoice.statement_total)} placeholder="0,00" /></FormField>
    <FormField label="Data do pagamento (opcional)" hint="Pagar a fatura não cria uma nova despesa."><Input name="paid" type="date" defaultValue={invoice.paid_at ?? ""} /></FormField>
  </FieldGroup><Footer label="Salvar conferência" /></form>;
}
