import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCommand, emptyState } from "../src/lib/finance/engine";
import { importPluggy, type BankTransaction, type BankBill } from "../src/integrations/pluggy/import";
import { fetchPluggy, pluggyConfig } from "../src/integrations/pluggy/client.server";
import { GET, POST } from "../src/app/api/integrations/pluggy/sync/route";
import { POST as financePost } from "../src/app/api/finance/route";
import { serverSupabase } from "../src/lib/supabase/server";

vi.mock("../src/lib/supabase/server", () => ({ serverSupabase: vi.fn() }));
const id = () => crypto.randomUUID();
function fixture() {
  const state = applyCommand(emptyState(), { id: id(), type: "add_card", institution_id: "nubank", name: "Meu cartão", last_four: "1234", closing_day: 25, due_day: 5 });
  state.audit[0].created_at = "2026-10-01T12:00:00Z";
  const accountId = id(), itemId = id(), userId = id();
  state.cards[0].id = accountId;
  const tx: BankTransaction = { id: id(), accountId, amount: 12.29, description: "Loja", date: "2026-10-02T01:00:00Z", type: "DEBIT", status: "POSTED", currencyCode: "BRL" };
  const batch = (transactions = [tx]) => ({ batches: [{ card: { ...state.cards[0] }, transactions, bills: [] as BankBill[] }], ignoredCards: 0, warnings: [] });
  const config = { clientId: "private-client", clientSecret: "private-secret", itemIds: [itemId], institutions: {} };
  const item = { id: itemId, connector: { name: "Nubank" } };
  const accounts = { totalPages: 1, results: [{ id: accountId, itemId, type: "CREDIT", subtype: "CREDIT_CARD", currencyCode: "BRL",
    name: "Meu cartão", number: "**** 1234", creditData: { balanceCloseDate: "2026-09-25" as string | null, balanceDueDate: "2026-10-05" as string | null } }] };
  const billsPage = { page: 1, totalPages: 0, results: [] as BankBill[] };
  const env = () => {
    vi.stubEnv("PLUGGY_CLIENT_ID", config.clientId); vi.stubEnv("PLUGGY_CLIENT_SECRET", config.clientSecret);
    vi.stubEnv("PLUGGY_ITEMS_JSON", JSON.stringify({ [userId]: [itemId] }));
    vi.stubEnv("PLUGGY_ITEM_INSTITUTIONS_JSON", "{}");
  };
  return { state, tx, batch, config, accounts, item, userId, billsPage, env };
}
function provider(responses: unknown[]) {
  const fetcher = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) fetcher.mockRejectedValueOnce(response);
    else fetcher.mockResolvedValueOnce(Response.json(response));
  }
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Meu Pluggy ledger", () => {
  it("imports exact cents as one pending installment and converts posting date to Brazil", () => {
    const f = fixture();
    const tx = { ...f.tx, creditCardMetadata: { billForecastDate: "2026-10", installmentNumber: 3, totalInstallments: 12, totalAmount: 147.48 } };
    const result = importPluggy(f.state, f.batch([tx]));
    expect(result.state.purchases[0]).toMatchObject({ amount: 1229, installments: 1, status: "pending", purchase_date: "2026-10-01" });
    expect(result.state.charges).toHaveLength(1);
    expect(result.state.allocations).toHaveLength(0);
    expect(result.state.sources[0]).toMatchObject({ source_type: "pluggy", external_id: tx.id });
    expect(f.state.purchases).toHaveLength(0);
  });
  it("imports pending expenses and keeps credits, payments and adjustments separate", () => {
    const f = fixture();
    const rows = [{ status: "PENDING" }, { type: "CREDIT" }, { amount: 0 }, { amount: -10 }, { currencyCode: "USD" },
      { operationType: "PAGAMENTO_FATURA" }, { operationType: "ESTORNO" }, { operationType: "CASHBACK" }].map(change => ({ ...f.tx, id: id(), ...change }));
    const result = importPluggy(f.state, f.batch(rows));
    expect(result.counts.ignored).toBe(1); expect(result.counts.bankEntries).toBe(6); expect(result.state.purchases).toHaveLength(1);
  });
  it("deduplicates IDs within/across calls but preserves distinct bank purchases with identical values", () => {
    const f = fixture();
    const first = importPluggy(f.state, f.batch([f.tx, f.tx, { ...f.tx, id: id() }]));
    expect(first.state.purchases).toHaveLength(2); expect(first.counts.existing).toBe(1);
    const second = importPluggy(first.state, f.batch());
    expect(second.counts.existing).toBe(1); expect(second.state.purchases).toEqual(first.state.purchases);
    const corrected = importPluggy(first.state, f.batch([{ ...f.tx, amount: 1 }]));
    expect(corrected.counts.changed).toBe(1); expect(corrected.state.purchases).toEqual(first.state.purchases);
  });
  it("holds possible manual or CSV installments even when the bank description differs", () => {
    const f = fixture();
    const state = applyCommand(f.state, { id: id(), type: "add_purchase", card_id: f.state.cards[0].id,
      merchant: "Outra descrição", amount: 3687, installments: 3, purchase_date: "2026-09-01", first_month: "2026-10", category_id: null,
      allocations: [{ person_id: f.state.people[0].id, amount: 3687 }] });
    expect(importPluggy(state, f.batch()).counts.similar).toBe(1);
    state.sources[0].source_type = "csv";
    expect(importPluggy(state, f.batch()).counts.similar).toBe(1);
  });
  it("rejects malformed money or account mismatches without changing input", () => {
    const f = fixture();
    expect(() => importPluggy(f.state, f.batch([{ ...f.tx, amount: 0.001 }]))).toThrow();
    expect(() => importPluggy(f.state, f.batch([{ ...f.tx, accountId: id() }]))).toThrow();
    expect(() => importPluggy(f.state, f.batch([{ ...f.tx, date: "2026-02-30" }]))).toThrow();
    expect(f.state.purchases).toHaveLength(0);
  });
});

describe("Pluggy automatic cards", () => {
  it("registers an incomplete card on the first sync and never duplicates it", () => {
    const f = fixture(); const input = emptyState(); const data = f.batch([]);
    data.batches[0].card.closing_day = null;
    data.batches[0].card.due_day = 13;
    const first = importPluggy(input, data);
    expect(first.state.cards).toEqual([data.batches[0].card]);
    expect(first.counts).toMatchObject({ registeredCards: 1, incompleteCards: 1, imported: 0 });
    expect(first.state.invoices).toHaveLength(0);
    const second = importPluggy(first.state, data);
    expect(second.state.cards).toEqual(first.state.cards);
    expect(second.counts).toMatchObject({ registeredCards: 0, incompleteCards: 1 });
    expect(input.cards).toHaveLength(0);
  });
  it("fills missing dates later, preserves existing fields and then imports purchases", () => {
    const f = fixture(); f.state.cards[0].closing_day = null;
    const data = f.batch();
    data.batches[0].card = { ...data.batches[0].card, name: "Renamed upstream", institution_id: "inter", last_four: "9876", closing_day: 24, due_day: 13 };
    const result = importPluggy(f.state, data);
    expect(result.state.cards[0]).toEqual({ ...f.state.cards[0], closing_day: 24 });
    expect(result.counts).toMatchObject({ registeredCards: 0, incompleteCards: 0, imported: 1 });
    expect(f.state.cards[0].closing_day).toBeNull();
  });
  it.each(["closing_day", "due_day"] as const)("blocks manual and CSV purchases when %s is missing", field => {
    const f = fixture(); f.state.cards[0][field] = null; const before = structuredClone(f.state);
    const row = { merchant: "Loja", amount: 100, installments: 1, purchase_date: "2026-10-01", first_month: "2026-10", category_id: null, external_id: "csv-1" };
    expect(() => applyCommand(f.state, { id: id(), type: "add_purchase", card_id: f.tx.accountId, ...row,
      allocations: [{ person_id: f.state.people[0].id, amount: 100 }] })).toThrow("aguarda as datas");
    expect(() => applyCommand(f.state, { id: id(), type: "import", card_id: f.tx.accountId, hash: "a".repeat(64), name: "test.csv", rows: [row] })).toThrow("aguarda as datas");
    expect(importPluggy(f.state, f.batch()).counts.imported).toBe(1);
    expect(f.state).toEqual(before);
    expect(() => applyCommand(emptyState(), { ...f.state.cards[0], id: id(), type: "add_card" })).toThrow();
  });
});

describe("Pluggy private client", () => {
  it("scopes configured items to the signed-in user, including an account without local cards", () => {
    const f = fixture(); f.env();
    const otherUser = id(), otherItem = id();
    vi.stubEnv("PLUGGY_ITEMS_JSON", JSON.stringify({ [f.userId]: [f.item.id, f.item.id], [otherUser]: [otherItem] }));
    expect(pluggyConfig(f.userId)).toEqual(f.config);
    expect(pluggyConfig(id())).toBeNull();
    expect(pluggyConfig(otherUser)?.itemIds).toEqual([otherItem]);
    vi.stubEnv("PLUGGY_ITEMS_JSON", "invalid"); expect(pluggyConfig(f.userId)).toBeNull();
    vi.stubEnv("PLUGGY_ITEMS_JSON", JSON.stringify({ [f.userId]: [f.item.id], [otherUser]: [f.item.id] }));
    expect(pluggyConfig(f.userId)).toBeNull();
  });
  it.each(["Nubank", "Banco Inter", "Mercado Pago"])("discovers %s, follows cursors and keeps authentication private", async name => {
    const f = fixture();
    const fetcher = provider([{ apiKey: "private-token" }, { ...f.item, connector: { name } }, f.accounts, f.billsPage,
      { results: [f.tx], next: `?accountId=${f.tx.accountId}&after=a%2Bb%3D` }, { results: [], next: null }]);
    const data = await fetchPluggy(f.config);
    expect(data.batches[0].card).toMatchObject({ id: f.tx.accountId, last_four: "1234", closing_day: 25, due_day: 5 });
    expect(data.batches[0].card.institution_id).toBe(({ Nubank: "nubank", "Banco Inter": "inter", "Mercado Pago": "mercado-pago" })[name]);
    expect(data.batches[0].transactions).toEqual([f.tx]);
    expect(fetcher.mock.calls[5][0]).toBe(`https://api.pluggy.ai/v2/transactions?accountId=${f.tx.accountId}&after=a%2Bb%3D`);
    expect(fetcher.mock.calls[5][1]).toMatchObject({ headers: { "X-API-KEY": "private-token" }, redirect: "error", cache: "no-store" });
  });
  it("imports the complete history even when account billing dates are missing", async () => {
    const f = fixture(); f.accounts.results[0].creditData = { balanceCloseDate: null, balanceDueDate: "2026-10-13" };
    const fetcher = provider([{ apiKey: "token" }, f.item, f.accounts, f.billsPage, { results: [f.tx], next: null }]);
    const data = await fetchPluggy(f.config);
    expect(data.batches[0]).toMatchObject({ card: { closing_day: null, due_day: 13 }, transactions: [f.tx] });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("fills missing card dates from the latest bill and follows bill pagination", async () => {
    const f = fixture(); f.accounts.results[0].creditData = { balanceCloseDate: null, balanceDueDate: null };
    const bill: BankBill = { id: id(), dueDate: "2026-10-13T00:00:00Z", billClosingDate: "2026-10-05T00:00:00Z", totalAmount: 100, totalAmountCurrencyCode: "BRL" };
    const fetcher = provider([{ apiKey: "token" }, f.item, f.accounts,
      { page: 1, totalPages: 2, results: [bill] }, { page: 2, totalPages: 2, results: [{ ...bill, id: id(), dueDate: "2026-09-13" }] },
      { results: [f.tx], next: null }]);
    const data = await fetchPluggy(f.config);
    expect(data.batches[0].card).toMatchObject({ closing_day: 5, due_day: 13 });
    expect(data.batches[0].bills).toHaveLength(2);
    expect(fetcher.mock.calls[4][0]).toContain("page=2");
  });
  it("uses only the authenticated user's confirmed institution for generic connectors", async () => {
    const f = fixture(); f.env();
    vi.stubEnv("PLUGGY_ITEM_INSTITUTIONS_JSON", JSON.stringify({ [f.item.id]: "inter", [id()]: "nubank" }));
    const config = pluggyConfig(f.userId)!;
    expect(config.institutions).toEqual({ [f.item.id]: "inter" });
    provider([{ apiKey: "token" }, { ...f.item, connector: { name: "MeuPluggy" } }, f.accounts, f.billsPage, { results: [], next: null }]);
    expect((await fetchPluggy(config)).batches[0].card.institution_id).toBe("inter");
  });
  it.each([{ currencyCode: "USD" }, { type: "BANK" }, { subtype: "LOAN" }, { number: null }, { number: "***123" }])("skips incompatible accounts with a warning: %j", async change => {
    const f = fixture(); const fetcher = provider([{ apiKey: "token" }, f.item, { ...f.accounts, results: [{ ...f.accounts.results[0], ...change }] }]);
    const data = await fetchPluggy(f.config);
    expect(data.batches).toHaveLength(0); expect(data.ignoredCards).toBe(1); expect(data.warnings).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("skips unidentified connectors instead of guessing the bank from an account name", async () => {
    const f = fixture(); provider([{ apiKey: "token" }, { ...f.item, connector: { name: "MeuPluggy" } }, f.accounts]);
    expect(await fetchPluggy(f.config)).toMatchObject({ batches: [], ignoredCards: 1, warnings: [expect.stringContaining("banco não reconhecido")] });
  });
  it("rejects unexpected items and account ownership before requesting transactions", async () => {
    const f = fixture();
    let fetcher = provider([{ apiKey: "token" }, { ...f.item, id: id() }]);
    await expect(fetchPluggy(f.config)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher = provider([{ apiKey: "token" }, f.item, { ...f.accounts, results: [{ ...f.accounts.results[0], itemId: id() }] }]);
    await expect(fetchPluggy(f.config)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects external or cross-account cursors and repeating pages", async () => {
    const f = fixture();
    for (const next of ["https://evil.example/?after=x", `?accountId=${id()}&after=x`]) {
      const fetcher = provider([{ apiKey: "token" }, f.item, f.accounts, f.billsPage, { results: [f.tx], next }]);
      await expect(fetchPluggy(f.config)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(5);
    }
    const page = { results: [], next: `?accountId=${f.tx.accountId}&after=x` };
    const fetcher = provider([{ apiKey: "token" }, f.item, f.accounts, f.billsPage, page, page]);
    await expect(fetchPluggy(f.config)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it("rejects incomplete account pagination and transaction page limits", async () => {
    const f = fixture();
    provider([{ apiKey: "token" }, f.item, { ...f.accounts, totalPages: 2 }]);
    await expect(fetchPluggy(f.config)).rejects.toThrow();
    const pages = Array.from({ length: 20 }, (_, i) => ({ results: [], next: `?accountId=${f.tx.accountId}&after=${i}` }));
    const fetcher = provider([{ apiKey: "token" }, f.item, f.accounts, f.billsPage, ...pages]);
    await expect(fetchPluggy(f.config)).rejects.toThrow("Paginação incompleta");
    expect(fetcher).toHaveBeenCalledTimes(24);
  });
});

function database(f: ReturnType<typeof fixture>, authenticated = true, commitError: { code: string } | null = null) {
  const rpc = vi.fn().mockImplementation(async (name: string) => name === "finance_snapshot"
    ? { data: f.state, error: null } : { data: null, error: commitError });
  const db = { auth: { getUser: async () => ({ data: { user: authenticated ? { id: f.userId } : null }, error: null }) }, rpc };
  vi.mocked(serverSupabase).mockResolvedValue(db as unknown as Awaited<ReturnType<typeof serverSupabase>>);
  return rpc;
}
const post = () => POST(new Request("http://localhost/api/integrations/pluggy/sync", { method: "POST" }));
describe("Pluggy authenticated route", () => {
  it.each([POST, financePost])("uses the public host instead of the Next.js bind address", async route => {
    const f = fixture(); const rpc = database(f, false); const fetcher = provider([]);
    const response = await route(new Request("http://0.0.0.0:3010/api/test", { method: "POST", headers: {
      origin: "http://localhost:3010", host: "localhost:3010", "sec-fetch-site": "same-origin",
    } }));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects signed-out and cross-origin requests without touching financial data", async () => {
    const f = fixture(); const rpc = database(f, false); const fetcher = provider([]);
    expect((await post()).status).toBe(401); expect((await GET()).status).toBe(401);
    for (const headers of [new Headers({ origin: "https://evil.example" }), new Headers({ "sec-fetch-site": "cross-site" })]) {
      expect((await POST(new Request("http://localhost/api/integrations/pluggy/sync", { method: "POST", headers }))).status).toBe(403);
    }
    expect(rpc).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("enables first sync without local cards and exposes no item IDs or credentials", async () => {
    const f = fixture(); f.env(); f.state.cards = []; database(f); const fetcher = provider([]);
    const status = await GET(); expect(await status.json()).toEqual({ configured: true, lastSync: null, allocationStartDate: "2026-10-01" });
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("PLUGGY_ITEMS_JSON", JSON.stringify({ [id()]: [f.item.id] }));
    expect(await (await GET()).json()).toEqual({ configured: false, lastSync: null, allocationStartDate: "2026-10-01" });
    expect((await post()).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it("commits new cards and purchases once, using the original revision", async () => {
    const f = fixture(); f.env(); f.state.cards = []; const rpc = database(f);
    provider([{ apiKey: "token" }, f.item, f.accounts, f.billsPage, { results: [f.tx], next: null }]);
    const response = await post(); expect(response.status).toBe(200);
    expect((await response.json()).counts).toMatchObject({ imported: 1, registeredCards: 1, incompleteCards: 0 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ expected_revision: f.state.revision, state: {
      revision: f.state.revision + 1, cards: [expect.objectContaining({ id: f.tx.accountId })], purchases: [expect.any(Object)],
    } });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(f.state.cards).toHaveLength(0);
  });
  it("saves an incomplete first card without creating purchases or invoices", async () => {
    const f = fixture(); f.env(); f.state.cards = []; const rpc = database(f);
    provider([{ apiKey: "token" }, f.item, { ...f.accounts, results: [{ ...f.accounts.results[0], creditData: null }] }, f.billsPage, { results: [], next: null }]);
    expect((await post()).status).toBe(200);
    expect(rpc.mock.calls[1][1].state).toMatchObject({ cards: [expect.objectContaining({ closing_day: null, due_day: null })], purchases: [], invoices: [] });
  });
  it("never commits a partially fetched result or returns raw upstream errors", async () => {
    const f = fixture(); f.env(); f.state.cards = []; const rpc = database(f);
    provider([{ apiKey: "token" }, f.item, f.accounts, f.billsPage, { results: [f.tx], next: `?accountId=${f.tx.accountId}&after=x` }, new Error("private-token private-secret")]);
    const response = await post(); expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private-");
    expect(rpc).toHaveBeenCalledTimes(1); expect(f.state.cards).toHaveLength(0); expect(f.state.purchases).toHaveLength(0);
  });
  it.each([{ code: "40001", status: 409 }, { code: "23514", status: 500 }])("handles commit failure $code without retrying or returning success", async ({ code, status }) => {
    const f = fixture(); f.env(); const rpc = database(f, true, { code });
    provider([{ apiKey: "token" }, f.item, f.accounts, f.billsPage, { results: [f.tx], next: null }]);
    expect((await post()).status).toBe(status); expect(rpc).toHaveBeenCalledTimes(2);
  });
});
