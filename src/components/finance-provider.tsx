"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { applyCommand } from "@/lib/finance/engine";
import { demoState } from "@/lib/finance/demo";
import type { FinanceState } from "@/lib/finance/types";

const demoKey = "conta-clara-demo-v1";
const Context = createContext<{ state: FinanceState | undefined; demo: boolean; loading: boolean; error: Error | null; saving: boolean; mutate: (command: Record<string, unknown>) => Promise<void>; reload: () => void } | null>(null);
async function responseData(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar os dados.");
  return data as FinanceState;
}
function FinanceData({ demo, children }: { demo: boolean; children: ReactNode }) {
  const client = useQueryClient();
  const key = ["finance", demo ? "demo" : "account"];
  const query = useQuery({ queryKey: key, queryFn: async () => {
    if (!demo) return responseData(await fetch("/api/finance", { cache: "no-store" }));
    const saved = localStorage.getItem(demoKey);
    if (saved) {
      try { const parsed = JSON.parse(saved); if (!Array.isArray(parsed.purchases) || !Array.isArray(parsed.audit) || typeof parsed.revision !== "number") throw new Error(); return parsed as FinanceState; }
      catch { throw new Error("Os dados de demonstração estão inválidos. Exclua a chave conta-clara-demo-v1 do armazenamento do navegador para reiniciar."); }
    }
    const state = demoState(); localStorage.setItem(demoKey, JSON.stringify(state)); return state;
  }, retry: false, refetchOnWindowFocus: !demo });
  const mutation = useMutation({ mutationFn: async (command: Record<string, unknown>) => {
    const complete = { ...command, id: crypto.randomUUID() };
    if (!demo) return responseData(await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(complete) }));
    const current = JSON.parse(localStorage.getItem(demoKey)!) as FinanceState;
    const next = applyCommand(current, complete);
    localStorage.setItem(demoKey, JSON.stringify(next));
    return next;
  }, onSuccess: state => { client.setQueryData(key, state); toast.success("Salvo com sucesso."); }, onError: error => { toast.error(error.message); void client.invalidateQueries({ queryKey: key }); } });
  return <Context.Provider value={{ state: query.data, demo, loading: query.isPending, error: query.error, saving: mutation.isPending, mutate: async command => { await mutation.mutateAsync(command); }, reload: () => { void query.refetch(); } }}>{children}</Context.Provider>;
}
export function FinanceProvider({ demo, children }: { demo: boolean; children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30000 } } }));
  return <QueryClientProvider client={client}><FinanceData demo={demo}>{children}</FinanceData></QueryClientProvider>;
}
export function useFinance() { const value = useContext(Context); if (!value) throw new Error("FinanceProvider ausente"); return value; }
