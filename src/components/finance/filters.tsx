"use client";
import { SlidersHorizontal } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { banks, type Filters } from "@/lib/finance/types";
import { SelectField } from "./shared";
import { today } from "@/lib/finance/money";
export function FilterBar({ filters, change, allowAllMonths = false }: { filters: Filters; change: (next: Partial<Filters>) => void; allowAllMonths?: boolean }) {
  const { state } = useFinance();
  if (!state) return null;
  return <div className="filter-bar">
    {allowAllMonths ? <SelectField label="Período" value={filters.month ? "month" : "all"} onChange={value => change({ month: value === "all" ? "" : today().slice(0, 7) })}><option value="all">Todo o histórico</option><option value="month">Mês específico</option></SelectField> : null}
    {filters.month ? <label className="select-field month-control"><span className="sr-only">Mês da fatura</span><input type="month" aria-label="Mês da fatura" value={filters.month} min="2000-01" max="2099-12" onChange={e => e.target.value && change({ month: e.target.value })} /></label> : null}
    <SelectField label="Banco" value={filters.bank} onChange={bank => change({ bank, card: "" })}><option value="">Todos os bancos</option>{Object.entries(banks).map(([id, b]) => <option key={id} value={id}>{b.name}</option>)}</SelectField>
    <SelectField label="Cartão" value={filters.card} onChange={card => change({ card })}><option value="">Todos os cartões</option>{state.cards.filter(c => !filters.bank || c.institution_id === filters.bank).map(c => <option key={c.id} value={c.id}>{c.name} · {c.last_four}</option>)}</SelectField>
    <SelectField label="Categoria" value={filters.category} onChange={category => change({ category })}><option value="">Todas as categorias</option>{state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
    <SelectField label="Responsável" value={filters.person} onChange={person => change({ person })}><option value="">Todos os responsáveis</option>{state.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField>
    {(filters.bank || filters.card || filters.category || filters.person) ? <button className="filter-clear" title="Limpar filtros" aria-label="Limpar filtros" onClick={() => change({ bank: "", card: "", category: "", person: "" })}><SlidersHorizontal size={17} /> Limpar</button> : null}
  </div>;
}
