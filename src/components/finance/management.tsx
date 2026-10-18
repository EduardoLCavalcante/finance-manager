"use client";
import { Download, Plus, CheckCircle2, ArrowRight, UsersRound, Info } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { money, dateLabel, monthLabel } from "@/lib/finance/money";
import { personBalance, allocationBalance, hasBillingDates } from "@/lib/finance/engine";
import type { Filters } from "@/lib/finance/types";
import { Blank, CardName, Panel } from "./shared";
import type { Modal } from "./forms";
import { PluggySync } from "./pluggy-sync";

export function Cards({ open }: { open: (m: Modal) => void }) {
  const { state } = useFinance(); if (!state) return null;
  return <><Panel title="Cartões cadastrados" action={<Button onClick={() => open({ kind: "card" })}><Plus />Adicionar cartão</Button>}>
    {!state.cards.length ? <Blank title="Comece pelo seu cartão" description="Use Sincronizar cartões abaixo para descobrir seus cartões pela Pluggy ou cadastre um cartão manualmente." onAction={() => open({ kind: "card" })} action="Adicionar primeiro cartão" /> : <div className="table-scroll"><table className="finance-table"><thead><tr><th>Cartão</th><th>Nome</th><th>Fechamento</th><th>Vencimento</th><th>Situação</th></tr></thead><tbody>{state.cards.map(c => <tr key={c.id}><td><CardName card={c} /></td><td>{c.name}</td><td>{c.closing_day === null ? "Não informado" : `Dia ${c.closing_day}`}</td><td>{c.due_day === null ? "Não informado" : `Dia ${c.due_day}`}</td><td>{hasBillingDates(c) ? "Pronto para compras" : "Aguardando datas da Pluggy"}</td></tr>)}</tbody></table></div>}
    <div className="panel-footnote"><Info size={16} />A Pluggy também completa as datas pelos dados das faturas. O histórico permanece disponível mesmo com datas não informadas.</div>
  </Panel><PluggySync /></>;
}
export function Invoices({ filters, open }: { filters: Filters; open: (m: Modal) => void }) {
  const { state } = useFinance(); if (!state) return null;
  const invoices = state.invoices.filter(i => (i.bank_id || i.statement_total !== null || state.charges.some(c => c.invoice_id === i.id)) && (!filters.month || i.month === filters.month) && (!filters.card || i.card_id === filters.card) && (!filters.bank || state.cards.find(c => c.id === i.card_id)?.institution_id === filters.bank)).sort((a, b) => b.month.localeCompare(a.month));
  return <Panel title={filters.month ? `Faturas de ${monthLabel(filters.month)}` : "Todas as faturas"}>
    {!invoices.length ? <Blank title="Nenhuma fatura neste mês" description="As faturas são criadas automaticamente quando você registra uma compra." /> : <div className="invoice-list">{invoices.map(invoice => {
      const total = state.charges.filter(c => c.invoice_id === invoice.id).reduce((s, c) => s + c.amount, 0);
      const difference = invoice.statement_total === null ? null : invoice.statement_total - total;
      return <div className="invoice-row" key={invoice.id}><div><CardName card={state.cards.find(c => c.id === invoice.card_id)!} /><small>{monthLabel(invoice.month)}</small></div><div><small>Fechamento</small><strong>{dateLabel(invoice.closing_date)}</strong></div><div><small>Vencimento</small><strong>{dateLabel(invoice.due_date)}</strong></div><div><small>{invoice.bank_id ? "Total da fatura no banco" : "Fatura estimada"}</small><strong>{money(invoice.statement_total ?? total)}</strong><small>Compras registradas: {money(total)}</small></div><div><Badge variant={invoice.paid_at ? "secondary" : "outline"}>{invoice.paid_at ? "Paga" : "Pagamento a conferir"}</Badge><small className={difference === 0 ? "text-green" : "text-muted"}>{invoice.bank_id ? "Fatura recebida da Pluggy" : difference === null ? "Extrato não conferido" : difference === 0 ? "Conciliada com o extrato" : `Diferença: ${money(difference)}`}</small></div><Button variant="outline" onClick={() => open({ kind: "statement", id: invoice.id })}>Conferir <ArrowRight /></Button></div>;
    })}</div>}
    <p className="page-note">As faturas mostram o total completo de cada cartão. Categoria e responsável não reduzem o valor devido ao banco.</p>
  </Panel>;
}
export function People({ open }: { open: (m: Modal) => void }) {
  const { state } = useFinance(); if (!state) return null;
  return <Panel title="Responsáveis pelas despesas" action={<Button onClick={() => open({ kind: "person" })}><Plus />Novo responsável</Button>}><div className="table-scroll"><table className="finance-table"><thead><tr><th>Pessoa</th><th className="number">Despesas totais</th><th className="number">Estornos</th><th className="number">Recebido</th><th className="number">Saldo</th><th /></tr></thead><tbody>{state.people.map(person => {
    const balance = personBalance(state, person.id);
    return <tr key={person.id}><td><div className="person-name"><span className="person-avatar"><UsersRound size={17} /></span><strong>{person.name}</strong>{person.is_owner ? <Badge variant="secondary">Você</Badge> : null}</div></td><td className="number">{money(balance.original)}</td><td className="number">{money(balance.refunds)}</td><td className="number">{person.is_owner ? "—" : money(balance.paid)}</td><td className="number"><strong className={balance.balance < 0 ? "text-purple" : "text-green"}>{money(balance.balance)}</strong>{balance.balance < 0 ? <small>A devolver</small> : null}</td><td>{!person.is_owner && balance.balance > 0 ? <Button variant="outline" size="sm" onClick={() => open({ kind: "reimbursement", id: person.id })}>Receber</Button> : null}</td></tr>;
  })}</tbody></table></div><p className="page-note">Saldos de todo o histórico, incluindo parcelas futuras. Um saldo negativo representa crédito da pessoa após estornos.</p></Panel>;
}
export function Reimbursements({ open }: { open: (m: Modal) => void }) {
  const { state } = useFinance(); if (!state) return null;
  return <Panel title="Recebimentos registrados" action={<Button onClick={() => open({ kind: "reimbursement" })}><Plus />Registrar reembolso</Button>}>
    {!state.reimbursements.length ? <Blank title="Nenhum reembolso registrado" description="Recebeu um Pix de alguém? Registre aqui para atualizar o saldo pendente." /> : <div className="table-scroll"><table className="finance-table"><thead><tr><th>Responsável</th><th>Recebido em</th><th>Observação</th><th>Despesas atendidas</th><th className="number">Valor</th></tr></thead><tbody>{[...state.reimbursements].sort((a, b) => b.received_at.localeCompare(a.received_at)).map(r => <tr key={r.id}><td><strong>{state.people.find(p => p.id === r.person_id)?.name}</strong></td><td>{dateLabel(r.received_at)}</td><td>{r.note || "—"}</td><td>{state.reimbursement_allocations.filter(a => a.reimbursement_id === r.id).length}</td><td className="number text-green amount">{money(r.amount)}</td></tr>)}</tbody></table></div>}
  </Panel>;
}
export function Settings({ open }: { open: (m: Modal) => void }) {
  const { state, demo } = useFinance(); if (!state) return null;
  const download = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exported_at: new Date().toISOString(), data: state }, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `conta-clara-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); };
  return <div className="settings-grid"><Panel title="Seus dados"><div className="settings-content"><CheckCircle2 size={24} className="text-green" /><h3>{demo ? "Demonstração local" : "Conta conectada"}</h3><p>{demo ? "Os dados de exemplo e suas alterações ficam somente neste navegador. Use sua conta para registrar despesas reais." : "Seus dados são salvos no Supabase e vinculados à sua conta. Outros usuários não têm acesso aos seus registros."}</p><Button variant="outline" onClick={download}><Download />Exportar dados em JSON</Button><small>A exportação contém informações financeiras. Guarde o arquivo em um local privado.</small></div></Panel>
    <Panel title="Categorias" action={<Button size="sm" variant="outline" onClick={() => open({ kind: "category" })}><Plus />Nova categoria</Button>}><div className="category-list">{state.categories.map(c => <Badge key={c.id} variant="secondary">{c.name}</Badge>)}</div></Panel>
    <Panel title="Importações"><div className="settings-content">{state.imports.length ? state.imports.map(f => <div className="history-row" key={f.id}><strong>{f.name}</strong><small>{f.row_count} compras · {dateLabel(f.created_at)}</small></div>) : <p>Nenhum arquivo importado.</p>}<Button variant="outline" onClick={() => open({ kind: "import" })}>Importar compras</Button></div></Panel>
    <Panel title="Integrações"><div className="settings-content"><p>CSV, cadastro manual e Meu Pluggy estão disponíveis. Configure os vínculos e sincronize na página Cartões.</p><Alert><Info /><AlertDescription>A sincronização Meu Pluggy é iniciada por você. Gmail, OFX e documentos ainda não estão disponíveis.</AlertDescription></Alert></div></Panel>
  </div>;
}
export function PurchaseDetails({ id, close, open }: { id: string | null; close: () => void; open: (m: Modal) => void }) {
  const { state } = useFinance(); if (!state || !id) return null;
  const purchase = state.purchases.find(p => p.id === id); if (!purchase) return null;
  const allocations = state.allocations.filter(a => a.purchase_id === id);
  const refunds = state.refunds.filter(r => r.purchase_id === id);
  const refunded = refunds.reduce((s, r) => s + r.amount, 0);
  const source = state.sources.find(source => source.purchase_id === id);
  const installmentLabel = source?.installment_no ? `Parcela ${source.installment_no}/${source.installment_count}` : `${purchase.installments} parcela(s)`;
  return <Dialog open onOpenChange={isOpen => !isOpen && close()}><DialogContent className="finance-dialog"><DialogHeader><DialogTitle>{purchase.merchant}</DialogTitle><DialogDescription>Compra de {dateLabel(purchase.purchase_date)} · {installmentLabel}</DialogDescription></DialogHeader>
    <div className="purchase-summary"><span>Valor original</span><strong>{money(purchase.amount)}</strong></div><CardName card={state.cards.find(c => c.id === purchase.card_id)!} />
    <h3>Responsabilidade pela compra</h3>{!allocations.length ? <Alert><AlertDescription>{purchase.status === "skipped" ? "Atribuição dispensada. Você pode definir um responsável quando quiser." : purchase.status === "historical" ? "Compra histórica: a atribuição de responsável é opcional." : "Esta compra ainda precisa ser atribuída."}</AlertDescription></Alert> : allocations.map(a => { const b = allocationBalance(state, a); const person = state.people.find(p => p.id === a.person_id)!; return <div className="detail-row" key={a.id}><div><strong>{person.name}</strong><small>{money(b.original)} · estornos {money(b.refunds)}{person.is_owner ? "" : ` · recebido ${money(b.paid)}`}</small></div><strong>{money(person.is_owner ? b.net : b.balance)}</strong></div>; })}
    {refunds.length ? <><h3>Estornos</h3>{refunds.map(r => <div className="detail-row" key={r.id}><span>{r.reason}<small>{dateLabel(r.received_at)}</small></span><strong className="text-green">−{money(r.amount)}</strong></div>)}</> : null}
    <h3>Parcelas e créditos</h3><div className="charge-history">{state.charges.filter(c => c.purchase_id === id).sort((a, b) => a.installment_no - b.installment_no).map(c => { const invoice = state.invoices.find(i => i.id === c.invoice_id)!; return <div className="detail-row" key={c.id}><span>{c.kind === "refund" ? "Estorno" : source?.installment_no ? installmentLabel : `Parcela ${c.installment_no}/${purchase.installments}`}<small>{monthLabel(invoice.month)}</small></span><strong>{money(c.amount)}</strong></div>; })}</div>
    <small className="text-muted">Origem: {({ csv: "Importação CSV", pluggy: "Meu Pluggy · lançamento individual; fatura estimada", manual: "Cadastro manual" })[state.sources.find(s => s.purchase_id === id)?.source_type || "manual"]}</small>
    <div className="form-footer">{purchase.status !== "confirmed" ? <Button onClick={() => { close(); open({ kind: "classify", id }); }}>Atribuir responsável</Button> : refunded < purchase.amount ? <Button variant="outline" onClick={() => { close(); open({ kind: "refund", id }); }}>Registrar estorno</Button> : <Badge variant="secondary">Totalmente estornada</Badge>}</div>
  </DialogContent></Dialog>;
}
