import { z } from "zod";
import { banks, type Card, type Institution } from "../../lib/finance/types";
import { billSchema, transactionSchema, type BankBatch, type PluggyData } from "./import";

const configSchema = z.object({
  clientId: z.string().trim().min(1), clientSecret: z.string().trim().min(1),
  items: z.record(z.uuid(), z.array(z.uuid())),
  institutions: z.record(z.uuid(), z.enum(["nubank", "inter", "mercado-pago"])),
});
export function pluggyConfig(userId: string) {
  try {
    const config = configSchema.parse({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET,
      items: JSON.parse(process.env.PLUGGY_ITEMS_JSON || "{}"), institutions: JSON.parse(process.env.PLUGGY_ITEM_INSTITUTIONS_JSON || "{}") });
    const owners = new Map<string, string>();
    for (const [owner, items] of Object.entries(config.items)) for (const item of items) {
      if (owners.has(item) && owners.get(item) !== owner) return null;
      owners.set(item, owner);
    }
    // Scope items before any provider call; deployment credentials may cover other users.
    const itemIds = [...new Set(config.items[userId] || [])];
    return itemIds.length ? { clientId: config.clientId, clientSecret: config.clientSecret, itemIds,
      institutions: Object.fromEntries(itemIds.filter(id => config.institutions[id]).map(id => [id, config.institutions[id]])) } : null;
  } catch { return null; }
}

const itemSchema = z.object({ id: z.uuid(), connector: z.object({ name: z.string().trim().min(1) }) });
const bankDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullish();
const accountsSchema = z.object({ totalPages: z.number().int().min(0).max(1), results: z.array(z.object({
  id: z.uuid(), itemId: z.uuid(), type: z.string(), subtype: z.string(), currencyCode: z.string(),
  name: z.string().nullish(), number: z.string().nullish(),
  creditData: z.object({ balanceCloseDate: bankDate, balanceDueDate: bankDate }).nullish(),
})).max(500) });
const pageSchema = z.object({ results: z.array(transactionSchema).max(500), next: z.string().max(10000).nullable() });
const billsPageSchema = z.object({ page: z.number().int().min(1), totalPages: z.number().int().min(0).max(20), results: z.array(billSchema).max(500) });
function institution(connector: string): Institution | null {
  const name = connector.toLowerCase();
  if (/\bnubank\b/.test(name)) return "nubank";
  if (/\b(?:banco )?inter\b/.test(name)) return "inter";
  if (/\bmercado\s*pago\b/.test(name)) return "mercado-pago";
  return null;
}
export async function fetchPluggy(config: NonNullable<ReturnType<typeof pluggyConfig>>): Promise<PluggyData> {
  if (!config.itemIds.length) throw new Error("Nenhum item configurado nesta conta.");
  const deadline = AbortSignal.timeout(90000);
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`https://api.pluggy.ai${path}`, { ...init, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]) });
    if (!response.ok) throw new Error("Falha ao consultar a Pluggy.");
    return response.json();
  }
  const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(await request("/auth", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret }),
  }));
  const headers = { "X-API-KEY": apiKey };
  const data: PluggyData = { batches: [], ignoredCards: 0, warnings: [] };
  let total = 0;
  for (const itemId of config.itemIds) {
    const item = itemSchema.parse(await request(`/items/${itemId}`, { headers }));
    if (item.id !== itemId) throw new Error("Item inesperado na resposta.");
    const bank = institution(item.connector.name) ?? config.institutions[itemId] ?? null;
    const accounts = accountsSchema.parse(await request(`/accounts?${new URLSearchParams({ itemId, type: "CREDIT" })}`, { headers }));
    for (const account of accounts.results) {
      if (account.itemId !== itemId) throw new Error("Conta inesperada na resposta.");
      const lastFour = account.number?.replace(/[\s-]/g, "").match(/(\d{4})$/)?.[1];
      if (account.type !== "CREDIT" || account.subtype !== "CREDIT_CARD" || account.currencyCode !== "BRL" || !bank || !lastFour) {
        data.ignoredCards++;
        data.warnings.push(!bank ? "Conta ignorada: banco não reconhecido pelo conector."
          : !lastFour ? "Conta ignorada: quatro últimos dígitos indisponíveis."
          : "Conta ignorada: é necessário um cartão de crédito em BRL.");
        continue;
      }
      if (data.batches.some(b => b.card.id === account.id)) continue;
      const card: Card = { id: account.id, institution_id: bank, name: account.name?.trim().slice(0, 160) || banks[bank].name,
        last_four: lastFour, closing_day: account.creditData?.balanceCloseDate ? Number(account.creditData.balanceCloseDate.slice(8, 10)) : null,
        due_day: account.creditData?.balanceDueDate ? Number(account.creditData.balanceDueDate.slice(8, 10)) : null };
      const batch: BankBatch = { card, transactions: [], bills: [] };
      data.batches.push(batch);
      for (let page = 1; ; page++) {
        const result = billsPageSchema.parse(await request(`/bills?${new URLSearchParams({ accountId: account.id, page: String(page), pageSize: "500" })}`, { headers }));
        if (result.page !== page || (page < result.totalPages && !result.results.length)) throw new Error("Paginação de faturas incompleta.");
        batch.bills.push(...result.results);
        if (batch.bills.length > 1000) throw new Error("Limite de faturas excedido.");
        if (page >= result.totalPages) break;
      }
      const latestBills = [...batch.bills].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
      const close = latestBills.find(b => b.billClosingDate)?.billClosingDate;
      card.closing_day ??= close ? Number(close.slice(8, 10)) : null;
      card.due_day ??= latestBills[0] ? Number(latestBills[0].dueDate.slice(8, 10)) : null;
      let query: string | null = `?${new URLSearchParams({ accountId: account.id })}`;
      const seen = new Set<string>();
      for (let page = 0; query; page++) {
        if (page >= 20 || seen.has(query)) throw new Error("Paginação incompleta.");
        seen.add(query);
        const result = pageSchema.parse(await request(`/v2/transactions${query}`, { headers }));
        if (result.results.some(t => t.accountId !== account.id)) throw new Error("Conta inesperada na resposta.");
        total += result.results.length;
        if (total > 10000) throw new Error("Limite de lançamentos excedido.");
        batch.transactions.push(...result.results);
        if (result.next) {
          // Only forward the cursor, never an upstream URL or a different account scope.
          const next = new URLSearchParams(result.next.startsWith("?") ? result.next.slice(1) : "");
          const after = next.get("after");
          if (!after || next.get("accountId") !== account.id) throw new Error("Cursor inválido.");
          query = `?${new URLSearchParams({ accountId: account.id, after })}`;
        } else query = null;
      }
    }
  }
  data.warnings = [...new Set(data.warnings)];
  return data;
}
