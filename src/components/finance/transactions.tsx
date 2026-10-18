"use client";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bankRows, chargeRows } from "@/lib/finance/selectors";
import type { Filters } from "@/lib/finance/types";
import { dateLabel, money, monthLabel } from "@/lib/finance/money";
import { Blank, CardName } from "./shared";
export function Transactions({ filters, onPurchase, limit }: { filters: Filters; onPurchase: (id: string) => void; limit?: number }) {
  const { state } = useFinance();
  if (!state) return null;
  const rows = [
    ...chargeRows(state, filters).map(row => ({ kind: "purchase" as const, row, date: row.purchase.purchase_date })),
    ...bankRows(state, filters).map(row => ({ kind: "bank" as const, row, date: row.entry.date })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) return <Blank title="Nenhum lançamento neste período" description="Sincronize seus cartões, registre uma compra ou revise os filtros." />;
  return <div className="table-scroll"><table className="finance-table"><thead><tr><th>Estabelecimento</th><th>Cartão</th><th>Fatura</th><th>Categoria</th><th>Responsável</th><th>Parcela / tipo</th><th className="number">Valor</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{rows.slice(0, limit ?? rows.length).map(item => {
    if (item.kind === "bank") {
      const { entry, card, invoice } = item.row;
      return <tr key={entry.id}>
        <td><div className="merchant-cell"><span className="merchant-icon"><ShoppingBag size={18} /></span><span><strong>{entry.merchant}</strong><small>{dateLabel(entry.date)}{entry.status === "PENDING" ? " · Pendente no banco" : ""}</small></span></div></td>
        <td><CardName card={card} /></td><td>{monthLabel(invoice.month, true)}</td><td><Badge variant="secondary">Movimentação bancária</Badge></td>
        <td><span className="text-muted">Sem atribuição</span></td><td>{entry.type === "CREDIT" ? "Crédito / pagamento" : "Ajuste / pagamento"}</td><td className="number amount">{money(entry.amount)}</td><td /></tr>;
    }
    const { row } = item;
    const source = state.sources.find(source => source.purchase_id === row.purchase.id);
    return <tr key={row.charge.id}>
      <td><button className="merchant-cell" onClick={() => onPurchase(row.purchase.id)}><span className="merchant-icon"><ShoppingBag size={18} /></span><span><strong>{row.purchase.merchant}</strong><small>{dateLabel(row.purchase.purchase_date)}{row.charge.kind === "refund" ? " · Estorno" : ""}</small></span></button></td>
      <td><CardName card={row.card} /></td><td>{monthLabel(row.invoice.month, true)}</td><td><Badge variant="secondary">{state.categories.find(c => c.id === row.purchase.category_id)?.name ?? "Sem categoria"}</Badge></td>
      <td>{row.purchase.status === "skipped" ? <Badge variant="secondary">Atribuição dispensada</Badge> : row.purchase.status === "historical" ? <Badge variant="secondary">Histórico · sem responsável</Badge> : row.purchase.status === "pending" ? <Badge variant="outline">A atribuir</Badge> : row.shares.length > 1 ? <span className="text-purple">Compartilhada</span> : <span className={row.others ? "text-purple" : ""}>{state.people.find(p => p.id === row.shares[0]?.person_id)?.name}</span>}</td>
      <td>{row.charge.kind === "refund" ? "Crédito" : source?.installment_no ? source.installment_no + "/" + source.installment_count : row.purchase.installments === 1 && source?.source_type === "pluggy" ? "Lançamento bancário" : row.charge.installment_no + "/" + row.purchase.installments}</td><td className={`number amount ${row.others && !row.own ? "text-purple" : "text-green"}`}>{money(row.amount)}</td>
      <td><Button variant="ghost" size="icon" aria-label={`Detalhes de ${row.purchase.merchant}`} onClick={() => onPurchase(row.purchase.id)}><ArrowUpRight /></Button></td>
    </tr>;
  })}</tbody></table></div>;
}
