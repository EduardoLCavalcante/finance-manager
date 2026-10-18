import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { serverSupabase } from "@/lib/supabase/server";
import { applyCommand, emptyState } from "@/lib/finance/engine";
import type { FinanceState } from "@/lib/finance/types";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function session() {
  const db = await serverSupabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return db;
}
export async function GET() {
  const db = await session();
  if (!db) return json({ error: "Entre na sua conta para continuar." }, 401);
  const snapshot = await db.rpc("finance_snapshot");
  if (snapshot.error) return json({ error: "Não foi possível carregar os dados financeiros." }, 500);
  let state = snapshot.data as FinanceState;
  if (!state.people.length) {
    const initial = emptyState();
    const saved = await db.rpc("finance_commit", { expected_revision: state.revision, state: initial });
    if (saved.error && saved.error.code !== "40001") return json({ error: "Não foi possível iniciar sua conta." }, 500);
    const fresh = await db.rpc("finance_snapshot");
    if (fresh.error) return json({ error: "Não foi possível carregar sua conta." }, 500);
    state = fresh.data as FinanceState;
  }
  return json(state);
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Origem inválida." }, 403);
  const db = await session();
  if (!db) return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
  const body = await request.text();
  if (body.length > 2000000) return json({ error: "Requisição muito grande." }, 413);
  try {
    const command = JSON.parse(body);
    const { data, error } = await db.rpc("finance_snapshot");
    if (error) return json({ error: "Não foi possível carregar os dados." }, 500);
    const state = data as FinanceState;
    if (!state.people.length) return json({ error: "Recarregue a página para iniciar sua conta." }, 409);
    const next = applyCommand(state, command);
    if (next === state) return json(state);
    const saved = await db.rpc("finance_commit", { expected_revision: state.revision, state: next });
    if (saved.error) return json({ error: saved.error.code === "40001" ? "Seus dados foram atualizados em outra janela. Recarregue e tente novamente." : "Não foi possível salvar. Nenhum dado desta operação foi gravado." }, saved.error.code === "40001" ? 409 : 500);
    return json(next);
  } catch (error) {
    return json({ error: error instanceof ZodError ? "Confira os campos obrigatórios, valores e datas." : error instanceof SyntaxError ? "Requisição inválida." : error instanceof Error ? error.message : "Não foi possível concluir a operação." }, 400);
  }
}
