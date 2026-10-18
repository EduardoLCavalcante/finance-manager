import { beforeEach, describe, expect, it, vi } from "vitest";
import { addPurchase, emptyState } from "../src/lib/finance/engine";

const db = vi.hoisted(() => ({ auth: { getUser: vi.fn() }, rpc: vi.fn() }));
vi.mock("../src/lib/supabase/server", () => ({ serverSupabase: async () => db }));
import { POST } from "../src/app/api/finance/route";

const id = () => crypto.randomUUID();
function fixture() {
  const state = emptyState();
  state.audit.push({ id: id(), action: "start", created_at: "2026-10-18T12:00:00Z" });
  state.cards.push({ id: id(), institution_id: "inter", name: "Inter", last_four: "6671", closing_day: 5, due_day: 12 });
  const purchase = addPurchase(state, { card_id: state.cards[0].id, merchant: "Teste", purchase_date: "2026-10-18", amount: 100, installments: 1, first_month: "2026-11", category_id: null });
  return { state, command: { id: id(), type: "skip_assignment", purchase_id: purchase.id } };
}
function request(command: unknown) {
  return new Request("http://localhost:3010/api/finance", { method: "POST", headers: { Origin: "http://localhost:3010", "Content-Type": "application/json" }, body: JSON.stringify(command) });
}
beforeEach(() => {
  vi.clearAllMocks();
  db.auth.getUser.mockResolvedValue({ data: { user: { id: id() } }, error: null });
});
describe("assignment API persistence", () => {
  it("requires an authenticated session", async () => {
    db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(request(fixture().command))).status).toBe(401);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("cannot skip a purchase outside the authenticated snapshot", async () => {
    const f = fixture();
    db.rpc.mockResolvedValue({ data: f.state, error: null });
    const result = await POST(request({ ...f.command, purchase_id: id() }));
    expect(result.status).toBe(400);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it("saves the complete change in one revision-controlled commit", async () => {
    const f = fixture();
    db.rpc.mockResolvedValueOnce({ data: f.state, error: null }).mockResolvedValueOnce({ data: 1, error: null });
    const result = await POST(request(f.command));
    expect(result.status).toBe(200);
    expect((await result.json()).purchases[0].status).toBe("skipped");
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(db.rpc.mock.calls[1]).toEqual(["finance_commit", { expected_revision: f.state.revision, state: expect.objectContaining({ revision: f.state.revision + 1, purchases: [expect.objectContaining({ status: "skipped" })] }) }]);
    expect(f.state.purchases[0].status).toBe("pending");
  });
  it.each([["40001", 409], ["XX000", 500]])("handles database failure %s without returning unsaved state", async (code, status) => {
    const f = fixture();
    db.rpc.mockResolvedValueOnce({ data: f.state, error: null }).mockResolvedValueOnce({ data: null, error: { code } });
    const result = await POST(request(f.command));
    expect(result.status).toBe(status);
    expect(await result.json()).toEqual({ error: expect.any(String) });
    expect(f.state.purchases[0].status).toBe("pending");
  });
});
