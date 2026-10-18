import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import type { FinanceState } from "@/lib/finance/types";
import { fetchPluggy, pluggyConfig } from "@/integrations/pluggy/client.server";
import { importPluggy } from "@/integrations/pluggy/import";
import { isAllowedOrigin } from "@/lib/request-origin";
import { allocationStartDate } from "@/lib/finance/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function context() {
  const db = await serverSupabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { response: json({ error: "Entre na sua conta para continuar." }, 401) };
  const snapshot = await db.rpc("finance_snapshot");
  if (snapshot.error) return { response: json({ error: "Não foi possível carregar seus cartões." }, 500) };
  const state = snapshot.data as FinanceState;
  return { db, state, config: pluggyConfig(user.id) };
}
export async function GET() {
  const ctx = await context();
  if (ctx.response) return ctx.response;
  return json({ configured: !!ctx.config, allocationStartDate: allocationStartDate(ctx.state),
    lastSync: ctx.state.audit.filter(a => a.action === "pluggy_sync").map(a => a.created_at).sort().at(-1) || null });
}
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return json({ error: "Origem inválida." }, 403);
  const ctx = await context();
  if (ctx.response) return ctx.response;
  if (!ctx.config) return json({ error: "Configure as credenciais e os itens desta conta conforme o guia Meu Pluggy." }, 503);
  let result;
  try {
    const data = await fetchPluggy(ctx.config);
    result = importPluggy(ctx.state, data);
  } catch {
    return json({ error: "A consulta à Pluggy não foi concluída. Confira as credenciais, os itens e a conexão no Meu Pluggy. Nenhum cartão ou lançamento desta tentativa foi salvo." }, 502);
  }
  const saved = await ctx.db.rpc("finance_commit", { expected_revision: ctx.state.revision, state: result.state });
  if (saved.error) return json({ error: saved.error.code === "40001"
    ? "Seus dados mudaram durante a consulta. Recarregue e sincronize novamente."
    : "Não foi possível salvar a sincronização. Nenhum cartão ou lançamento desta tentativa foi salvo." }, saved.error.code === "40001" ? 409 : 500);
  return json({ counts: result.counts, warnings: result.warnings, allocationStartDate: result.allocationStartDate, lastSync: result.state.audit.at(-1)!.created_at });
}
