"use client";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFinance } from "@/components/finance-provider";
import type { FinanceState } from "@/lib/finance/types";
import type { ImportRow } from "@/lib/finance/schema";
import { hasBillingDates, similarPurchase } from "@/lib/finance/engine";
import { fileHash, parseCsv } from "@/integrations/file-imports/csv";
import { money } from "@/lib/finance/money";
import { FormField } from "./forms";
export function ImportForm({ state, submit }: { state: FinanceState; submit: (command: Record<string, unknown>) => Promise<void> }) {
  const { saving } = useFinance();
  const availableCards = state.cards.filter(hasBillingDates);
  const [card, setCard] = useState(availableCards[0]?.id ?? "");
  const [file, setFile] = useState<{ name: string; hash: string; rows: ImportRow[] } | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reading, setReading] = useState(false);
  const duplicates = file?.rows.filter(r => r.external_id && state.sources.some(s => s.card_id === card && s.source_type === "csv" && s.external_id === r.external_id)).length ?? 0;
  const similar = file?.rows.filter(r => similarPurchase(state, card, r)).length ?? 0;
  if (!availableCards.length) return <p className="empty-note">{state.cards.length ? "Seus cartões aguardam as datas de fechamento e vencimento da Pluggy. A importação CSV estará disponível quando esses dados chegarem." : "Cadastre um cartão em “Cartões” antes de importar compras."}</p>;
  return <form onSubmit={e => { e.preventDefault(); if (!file) return; void submit({ type: "import", card_id: card, ...file, rows: file.rows.map(row => ({ ...row, allow_similar: confirmed })) }); }}><FieldGroup>
    <Alert><Upload /><AlertDescription>Cada linha representa o valor total de uma compra. Use o modelo abaixo; extratos de parcelas e pagamentos de fatura precisam ser convertidos antes da importação.</AlertDescription></Alert>
    <Button variant="outline" asChild><a href="/modelo-compras.csv" download><Download />Baixar modelo CSV</a></Button>
    <FormField label="Cartão" hint={availableCards.length < state.cards.length ? "Cartões sem fechamento ou vencimento aguardam dados da Pluggy e não podem receber compras." : undefined}><select value={card} required onChange={e => { setCard(e.target.value); setConfirmed(false); }}><option value="" disabled>Cadastre um cartão primeiro</option>{state.cards.map(c => <option value={c.id} key={c.id} disabled={!hasBillingDates(c)}>{c.name} · {c.last_four}{hasBillingDates(c) ? "" : " · Aguardando datas da Pluggy"}</option>)}</select></FormField>
    <FormField label="Arquivo CSV (até 1 MB)"><Input type="file" accept=".csv,text/csv" onChange={async e => {
      setFile(null); setError(""); setConfirmed(false);
      const selected = e.target.files?.[0]; if (!selected) return;
      setReading(true);
      try { if (selected.size > 1000000) throw new Error("O limite é de 1 MB."); const content = await selected.text(); const hash = await fileHash(content); const rows = parseCsv(content); setFile({ name: selected.name, hash, rows }); }
      catch (err) { setError(err instanceof Error ? err.message : "Não foi possível ler o arquivo."); } finally { setReading(false); }
    }} /></FormField>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {file ? <><div className="import-summary">{file.rows.length} compras · {duplicates} IDs já importados · {similar} possíveis semelhanças</div><div className="table-scroll import-preview"><table className="finance-table"><thead><tr><th>Data</th><th>Descrição</th><th>Parcelas</th><th className="number">Total</th></tr></thead><tbody>{file.rows.slice(0, 8).map((r, i) => <tr key={i}><td>{r.purchase_date}</td><td>{r.merchant}</td><td>{r.installments}</td><td className="number">{money(r.amount)}</td></tr>)}</tbody></table></div>{file.rows.length > 8 ? <p className="text-muted">Mostrando as primeiras 8 compras de {file.rows.length}.</p> : null}
      {similar ? <label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Revisei as compras semelhantes e confirmo que são compras diferentes. IDs repetidos serão ignorados.</label> : null}
      <p className="text-muted">Compras anteriores ao início do acompanhamento ficam no histórico sem responsável. As demais ficam “A atribuir”.</p>
    </> : null}
  </FieldGroup><div className="form-footer"><Button type="submit" disabled={!file || !card || reading || saving || (!!similar && !confirmed)}>{reading ? "Lendo arquivo…" : saving ? "Importando…" : "Confirmar importação"}</Button></div></form>;
}
