"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { House, List, UserRoundSearch, CreditCard, FileText, UsersRound, ArrowLeftRight, Settings2, Upload, Plus, Monitor, Database, LogOut, Menu, X, Search } from "lucide-react";
import { FinanceProvider, useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { browserSupabase } from "@/lib/supabase/browser";
import { today } from "@/lib/finance/money";
import type { Filters } from "@/lib/finance/types";
import { unassignedPurchases } from "@/lib/finance/selectors";
import { Dashboard } from "./dashboard";
import { FilterBar } from "./filters";
import { Transactions } from "./transactions";
import { UnassignedPurchases } from "./unassigned";
import { Cards, Invoices, People, Reimbursements, Settings, PurchaseDetails } from "./management";
import { FinanceDialog, type Modal } from "./forms";
import { Panel } from "./shared";
const nav = [
  { path: "dashboard", label: "Visão geral", icon: House, description: "Cada despesa no seu lugar." },
  { path: "transactions", label: "Transações", icon: List, description: "Acompanhe cada lançamento e quem participa da despesa." },
  { path: "unassigned", label: "Sem responsável", icon: UserRoundSearch, description: "Defina os responsáveis pelas compras ou dispense a atribuição." },
  { path: "cards", label: "Cartões", icon: CreditCard, description: "Seus cartões, reunidos em um só lugar." },
  { path: "invoices", label: "Faturas", icon: FileText, description: "Confira os valores e acompanhe os vencimentos." },
  { path: "people", label: "Responsáveis", icon: UsersRound, description: "Saiba quanto é seu e quanto cada pessoa deve." },
  { path: "reimbursements", label: "Reembolsos", icon: ArrowLeftRight, description: "Recebimentos parciais ou totais, com histórico preservado." },
  { path: "settings", label: "Configurações", icon: Settings2, description: "Organize categorias, importações e seus dados." },
];
export const sections = nav.map(n => n.path);
export function FinanceApp({ section, demo = false }: { section: string; demo?: boolean }) { return <FinanceProvider demo={demo}><AppContent section={section} /></FinanceProvider>; }
function AppContent({ section }: { section: string }) {
  const router = useRouter();
  const { demo, state, loading, error, reload } = useFinance();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ month: "", bank: "", card: "", category: "", person: "", search: "" });
  const activeFilters = section === "dashboard" && !filters.month ? { ...filters, month: today().slice(0, 7) } : filters;
  const current = nav.find(n => n.path === section) ?? nav[0];
  const change = (update: Partial<Filters>) => setFilters(f => ({ ...f, ...update }));
  const filtered = ["dashboard", "transactions", "invoices"].includes(section);
  const signOut = async () => { const { error } = await browserSupabase().auth.signOut(); if (!error) { router.replace("/login"); router.refresh(); } };
  return <div className="app-shell"><a href="#main" className="skip-link">Pular para o conteúdo</a>
    <div className="mobile-header"><Link href={demo ? "/demo/dashboard" : "/dashboard"} className="wordmark"><span className="brand-icon" />conta clara</Link><Button variant="ghost" size="icon" aria-label={menu ? "Fechar menu" : "Abrir menu"} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</Button></div>
    {menu ? <button className="menu-backdrop" aria-label="Fechar navegação" onClick={() => setMenu(false)} /> : null}
    <aside className={`sidebar ${menu ? "is-open" : ""}`}><Link href={demo ? "/demo/dashboard" : "/dashboard"} className="wordmark"><span className="brand-icon" />conta clara</Link><nav aria-label="Navegação principal">{nav.map(item => <Link key={item.path} href={demo ? `/demo/${item.path}` : `/${item.path}`} className={section === item.path ? "nav-item active" : "nav-item"} aria-current={section === item.path ? "page" : undefined} onClick={() => setMenu(false)}><item.icon size={20} strokeWidth={1.7} />{item.label}</Link>)}</nav>
      <div className="sidebar-bottom"><div><Monitor size={17} /><span>{demo ? "Modo demonstração" : "Conta pessoal"}</span></div><small><Database size={16} />{demo ? "Dados neste navegador" : "Dados salvos na sua conta"}</small>{demo ? <Link href="/login" className="account-link">Entrar na minha conta <ArrowLeftRight size={14} /></Link> : <button className="account-link" onClick={() => void signOut()}><LogOut size={15} />Sair da conta</button>}</div>
    </aside>
    <main id="main" className="main-content"><header className="page-header"><div><h1>{current.label}</h1><p>{current.description}</p></div>{["dashboard", "transactions"].includes(section) ? <div className="header-actions"><Button variant="outline" onClick={() => setModal({ kind: "import" })} disabled={!state}><Upload />Importar arquivo</Button><Button onClick={() => setModal({ kind: "purchase" })} disabled={!state}><Plus />Nova compra</Button></div> : null}</header>
      {loading ? <div className="loading-layout"><Skeleton className="h-12 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-80 w-full" /></div> : error ? <Alert variant="destructive"><AlertDescription>{error.message}<Button variant="outline" onClick={reload}>Tentar novamente</Button></AlertDescription></Alert> : <>
        {filtered ? <FilterBar filters={activeFilters} change={change} allowAllMonths={section !== "dashboard"} /> : null}
        <div className="page-content">
          {section === "dashboard" ? <Dashboard filters={activeFilters} onPurchase={setDetails} /> : null}
          {section === "transactions" ? <><div className="search-row"><Search size={18} /><Input aria-label="Buscar estabelecimento" placeholder="Buscar estabelecimento…" value={filters.search} onChange={e => change({ search: e.target.value })} /><span>{state ? unassignedPurchases(state, { bank: "", card: "", search: "" }).filter(row => !row.historical).length : 0} compras a atribuir</span></div><Panel title="Lançamentos por competência"><Transactions filters={activeFilters} onPurchase={setDetails} /></Panel></> : null}
          {section === "cards" ? <Cards open={setModal} /> : null}
          {section === "unassigned" ? <UnassignedPurchases open={setModal} onPurchase={setDetails} /> : null}
          {section === "invoices" ? <Invoices filters={activeFilters} open={setModal} /> : null}
          {section === "people" ? <People open={setModal} /> : null}
          {section === "reimbursements" ? <Reimbursements open={setModal} /> : null}
          {section === "settings" ? <Settings open={setModal} /> : null}
        </div>
      </>}
    </main>
    <FinanceDialog key={modal ? `${modal.kind}-${modal.id ?? "new"}` : "closed"} modal={modal} onClose={() => setModal(null)} /><PurchaseDetails id={details} close={() => setDetails(null)} open={setModal} />
  </div>;
}
