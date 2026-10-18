"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, FileText, UserRound, UsersRound, CircleDollarSign, Info, ChevronRight } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { forecast, totals } from "@/lib/finance/selectors";
import { money } from "@/lib/finance/money";
import type { Filters } from "@/lib/finance/types";
import { Blank, CardName, Panel } from "./shared";
import { Transactions } from "./transactions";
const ForecastChart = dynamic(() => import("@/components/charts/forecast-chart"), { ssr: false, loading: () => <Skeleton className="chart" /> });
export function Dashboard({ filters, onPurchase }: { filters: Filters; onPurchase: (id: string) => void }) {
  const { state, demo } = useFinance();
  if (!state) return null;
  const sum = totals(state, filters), href = (path: string) => demo ? `/demo/${path}` : `/${path}`;
  const metrics = [
    { label: filters.person ? "Parte selecionada no mês" : "Faturas do mês", value: sum.total, icon: FileText, color: "" },
    { label: "Minha parte", value: sum.own, icon: UserRound, color: "text-green" },
    { label: "Parte de terceiros", value: sum.others, icon: UsersRound, color: "text-purple" },
    { label: "A receber (total)", value: sum.receivable, icon: CircleDollarSign, color: "text-green" },
  ];
  return <>
    <div className="metrics">{metrics.map(m => <div className="metric" key={m.label}><m.icon className={m.color} size={24} strokeWidth={1.7} /><div><span>{m.label}</span><strong className={m.color}>{money(m.value)}</strong></div></div>)}</div>
    {sum.unassigned ? <Alert><Info /><AlertDescription>{money(sum.unassigned)} aguardam atribuição. Abra a compra para definir os responsáveis.</AlertDescription></Alert> : null}
    <div className="dashboard-middle">
      <Panel title="Próximas faturas" action={<div className="chart-legend"><span><i />Minha parte</span><span><i />Parte de terceiros</span></div>}><ForecastChart data={forecast(state, filters)} /></Panel>
      <Panel title="Seus cartões" className="cards-panel">
        {!state.cards.length ? <Blank title="Seu primeiro cartão" description="Cadastre um cartão para começar." /> : <div className="card-list">{state.cards.filter(c => !filters.bank || c.institution_id === filters.bank).map(card => {
          const invoice = state.invoices.find(i => i.card_id === card.id && i.month === filters.month);
          const value = state.charges.filter(c => c.invoice_id === invoice?.id).reduce((s, c) => s + c.amount, 0);
          return <Link href={href("invoices")} className="card-row" key={card.id}><CardName card={card} /><span className="card-total"><small>Fatura do mês</small><strong>{money(value)}</strong></span><ChevronRight size={16} /></Link>;
        })}</div>}
        <div className="panel-footnote"><Info size={15} /><span>Importação manual. Os totais dos cartões mostram a fatura completa.</span></div>
      </Panel>
    </div>
    <Panel title="Lançamentos do mês" action={<Button variant="link" asChild><Link href={href("transactions")}>Ver todas <ArrowRight /></Link></Button>}><Transactions filters={filters} onPurchase={onPurchase} limit={7} /></Panel>
    <p className="page-note">A receber considera todas as compras e reembolsos registrados, inclusive parcelas futuras. Os demais valores seguem os filtros.</p>
  </>;
}
