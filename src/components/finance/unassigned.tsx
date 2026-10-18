"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateLabel, money } from "@/lib/finance/money";
import { unassignedPurchases } from "@/lib/finance/selectors";
import { banks } from "@/lib/finance/types";
import type { Modal } from "./forms";
import { Blank, CardName, Panel, SelectField } from "./shared";

export function UnassignedPurchases({ open, onPurchase }: { open: (modal: Modal) => void; onPurchase: (id: string) => void }) {
  const { state, saving, mutate } = useFinance();
  const [filters, setFilters] = useState({ bank: "", card: "", search: "" });
  const [error, setError] = useState("");
  if (!state) return null;
  const rows = unassignedPurchases(state, filters);
  const hasFilters = !!(filters.bank || filters.card || filters.search);
  const skip = async (id: string) => {
    setError("");
    try { await mutate({ type: "skip_assignment", purchase_id: id }); }
    catch (error) { setError(error instanceof Error ? error.message : "Não foi possível dispensar a atribuição."); }
  };
  return <>
    <div className="filter-bar">
      <SelectField label="Banco" value={filters.bank} onChange={bank => setFilters(f => ({ ...f, bank, card: "" }))}><option value="">Todos os bancos</option>{Object.entries(banks).map(([id, bank]) => <option key={id} value={id}>{bank.name}</option>)}</SelectField>
      <SelectField label="Cartão" value={filters.card} onChange={card => setFilters(f => ({ ...f, card }))}><option value="">Todos os cartões</option>{state.cards.filter(card => !filters.bank || card.institution_id === filters.bank).map(card => <option key={card.id} value={card.id}>{card.name} · {card.last_four}</option>)}</SelectField>
      {hasFilters ? <Button variant="ghost" onClick={() => setFilters({ bank: "", card: "", search: "" })}>Limpar filtros</Button> : null}
    </div>
    <div className="search-row"><Search size={18} aria-hidden="true" /><Input aria-label="Buscar estabelecimento" placeholder="Buscar estabelecimento…" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /><span aria-live="polite">{rows.length} {rows.length === 1 ? "compra" : "compras"} sem responsável</span></div>
    <p className="text-muted">Atribua uma vez para todas as parcelas agrupadas. O histórico tem atribuição opcional. Ao pular, o grupo sai desta lista; as parcelas continuam nas suas faturas.</p>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Panel title="Compras para gerenciar">
      {!rows.length ? <Blank title={hasFilters ? "Nenhuma compra corresponde aos filtros" : "Nenhuma compra para gerenciar"} description={hasFilters ? "Limpe ou ajuste os filtros para ver outras compras sem responsável." : "Todas as compras foram atribuídas ou tiveram a atribuição dispensada."} /> : <div className="table-scroll"><table className="finance-table"><thead><tr><th>Estabelecimento</th><th>Cartão</th><th>Categoria</th><th>Situação</th><th className="number">Valor a atribuir</th><th>Ações</th></tr></thead><tbody>{rows.map(({ purchase, card, purchases, merchant, installmentCount, amount, historical }) => <tr key={purchase.id}>
        <td><button className="merchant-cell" disabled={saving} onClick={() => onPurchase(purchase.id)}><span><strong>{merchant}</strong><small>{dateLabel(purchase.purchase_date)}</small>{installmentCount ? <small>{purchases.length} de {installmentCount} parcelas para gerenciar</small> : null}</span></button></td>
        <td><CardName card={card} /></td><td>{state.categories.find(category => category.id === purchase.category_id)?.name ?? "Sem categoria"}</td>
        <td><Badge variant={historical ? "secondary" : "outline"}>{historical ? "Histórico · atribuição opcional" : "A atribuir"}</Badge></td>
        <td className="number amount">{money(amount)}</td>
        <td><div className="flex flex-col items-start gap-2"><Button size="sm" disabled={saving} onClick={() => { setError(""); open({ kind: "classify", id: purchase.id }); }}>Atribuir responsável</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => void skip(purchase.id)}>Pular atribuição</Button></div></td>
      </tr>)}</tbody></table></div>}
    </Panel>
  </>;
}
