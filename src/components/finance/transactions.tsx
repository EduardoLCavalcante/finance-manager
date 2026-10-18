"use client";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chargeRows } from "@/lib/finance/selectors";
import type { Filters } from "@/lib/finance/types";
import { dateLabel, money } from "@/lib/finance/money";
import { Blank, CardName } from "./shared";
export function Transactions({ filters, onPurchase, limit }: { filters: Filters; onPurchase: (id: string) => void; limit?: number }) {
  const { state } = useFinance();
  if (!state) return null;
  const rows = chargeRows(state, filters);
  if (!rows.length) return <Blank title="Nenhum lançamento neste período" description="Registre uma compra ou escolha outro mês e revise os filtros." />;
  return <div className="table-scroll"><table className="finance-table"><thead><tr><th>Estabelecimento</th><th>Cartão</th><th>Categoria</th><th>Responsável</th><th>Parcela</th><th className="number">Valor</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{rows.slice(0, limit ?? rows.length).map(row => <tr key={row.charge.id}>
    <td><button className="merchant-cell" onClick={() => onPurchase(row.purchase.id)}><span className="merchant-icon"><ShoppingBag size={18} /></span><span><strong>{row.purchase.merchant}</strong><small>{dateLabel(row.purchase.purchase_date)}{row.charge.kind === "refund" ? " · Estorno" : ""}</small></span></button></td>
    <td><CardName card={row.card} /></td><td><Badge variant="secondary">{state.categories.find(c => c.id === row.purchase.category_id)?.name ?? "Sem categoria"}</Badge></td>
    <td>{row.purchase.status === "pending" ? <Badge variant="outline">A atribuir</Badge> : row.shares.length > 1 ? <span className="text-purple">Compartilhada</span> : <span className={row.others ? "text-purple" : ""}>{state.people.find(p => p.id === row.shares[0]?.person_id)?.name}</span>}</td>
    <td>{row.charge.kind === "refund" ? "Crédito" : `${row.charge.installment_no}/${row.purchase.installments}`}</td><td className={`number amount ${row.others && !row.own ? "text-purple" : "text-green"}`}>{money(row.amount)}</td>
    <td><Button variant="ghost" size="icon" aria-label={`Detalhes de ${row.purchase.merchant}`} onClick={() => onPurchase(row.purchase.id)}><ArrowUpRight /></Button></td>
  </tr>)}</tbody></table></div>;
}
