"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SyncCounts } from "@/integrations/pluggy/import";
import { allocationStartDate, hasBillingDates } from "@/lib/finance/engine";
import { dateLabel } from "@/lib/finance/money";
import { Panel } from "./shared";

const endpoint = "/api/integrations/pluggy/sync";
async function request(method: "GET" | "POST") {
  const response = await fetch(endpoint, { method, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Não foi possível sincronizar.");
  return body;
}
export function PluggySync() {
  const { state, demo, reload, saving } = useFinance();
  const status = useQuery<{ configured: boolean; lastSync: string | null; allocationStartDate: string }>({
    queryKey: ["pluggy-status", state?.cards.map(c => c.id)], queryFn: () => request("GET"), enabled: !demo, retry: false,
  });
  const sync = useMutation<{ counts: SyncCounts; warnings: string[]; lastSync: string; allocationStartDate: string }, Error>({
    mutationFn: () => request("POST"),
    onSuccess: () => { reload(); void status.refetch(); },
    onError: () => { reload(); },
  });
  const incomplete = state?.cards.filter(c => !hasBillingDates(c)) || [];
  const lastSync = sync.data?.lastSync || status.data?.lastSync;
  const startDate = sync.data?.allocationStartDate || status.data?.allocationStartDate || (state ? allocationStartDate(state) : null);
  return <Panel title="Meu Pluggy" action={<Button variant="outline" disabled={demo || status.isPending || !status.data?.configured || sync.isPending || saving} onClick={() => sync.mutate()}>
    <RefreshCw className={sync.isPending ? "animate-spin" : ""} />{sync.isPending ? "Sincronizando…" : "Sincronizar cartões"}
  </Button>}>
    <div className="settings-content">
      <p>{demo ? "Entre na sua conta para sincronizar seus cartões reais." : status.data?.configured
        ? "Sincronize para descobrir e cadastrar automaticamente os cartões disponíveis na sua conexão."
        : "Configure as credenciais e os itens desta conta no Meu Pluggy para habilitar a sincronização."}</p>
      {incomplete.length ? <p>Datas incompletas: {incomplete.map(c => `${c.name} · ${c.last_four}`).join(", ")}. O histórico é importado e usa as faturas do banco quando disponíveis; períodos sem fatura são estimados.</p> : null}
      <p>Importa todo o histórico disponível, as faturas e os lançamentos previstos. Compras anteriores a {dateLabel(startDate)} ficam sem responsável; compras dessa data em diante ficam “A atribuir”.</p>
      <small>Sincronizar copia os dados disponíveis no Meu Pluggy. A atualização no banco ocorre aproximadamente a cada 24 horas.</small>
      {lastSync ? <small>Última sincronização concluída: {new Date(lastSync).toLocaleString("pt-BR")}</small> : null}
      <div role="status" aria-live="polite">{sync.data ? <Alert><AlertDescription>
        <strong>{sync.data.counts.registeredCards} cartões cadastrados · {sync.data.counts.incompleteCards} aguardando datas · {sync.data.counts.ignoredCards} contas ignoradas.</strong>
        <strong>{sync.data.counts.imported} lançamentos importados.</strong>
        <span>{sync.data.counts.historical} compras históricas sem responsável · {sync.data.counts.bankEntries} créditos, pagamentos ou ajustes · {sync.data.counts.invoices} faturas cadastradas.</span>
        <span>{sync.data.counts.existing} já importados · {sync.data.counts.ignored} fora dos critérios.</span>
        <span>{sync.data.counts.similar} possíveis duplicidades de compras manuais/CSV · {sync.data.counts.changed} lançamentos alterados no banco. Esses registros foram preservados e precisam de conferência com o extrato.</span>
        {sync.data.warnings.map(warning => <span key={warning}>{warning}</span>)}
      </AlertDescription></Alert> : null}</div>
      {sync.error || status.error ? <Alert variant="destructive" role="alert"><AlertDescription>{(sync.error || status.error)?.message}
        {status.error ? <Button variant="outline" size="sm" onClick={() => void status.refetch()}>Tentar novamente</Button> : null}
      </AlertDescription></Alert> : null}
    </div>
  </Panel>;
}
