import { describe, expect, it } from "vitest";
import { applyCommand, emptyState, personBalance, suggestedMonth } from "../src/lib/finance/engine";
import { chargeShares } from "../src/lib/finance/selectors";
import { cents, distribute, splitEvenly } from "../src/lib/finance/money";
import { parseCsv } from "../src/integrations/file-imports/csv";
const id = () => crypto.randomUUID();
function fixture() {
  let state = emptyState();
  state = applyCommand(state, { id: id(), type: "add_card", institution_id: "nubank", name: "Nubank", last_four: "1234", closing_day: 25, due_day: 5 });
  state = applyCommand(state, { id: id(), type: "add_person", name: "Ana" });
  const purchase = (amount = 120000, installments = 6, shares = [{ person_id: state.people[1].id, amount }]) => ({ id: id(), type: "add_purchase", card_id: state.cards[0].id, merchant: "Loja", amount, installments, purchase_date: "2026-10-01", first_month: "2026-11", category_id: null, allocations: shares });
  return { state, purchase };
}
describe("ledger invariants", () => {
  it("preserves exact cents for money, splits and large weighted amounts", () => {
    expect(cents("R$ 1.234,56")).toBe(123456);
    expect(cents("0.29")).toBe(29);
    expect(() => cents("1.234")).toThrow();
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(distribute(999999999999, [333333333333, 666666666666])).toEqual([333333333333, 666666666666]);
  });
  it("records a purchase once and keeps older purchases in later invoices", () => {
    const f = fixture(); const state = applyCommand(f.state, f.purchase());
    expect(state.purchases).toHaveLength(1); expect(state.charges).toHaveLength(6);
    expect(state.charges.reduce((s, c) => s + c.amount, 0)).toBe(120000);
    expect(state.invoices.map(i => i.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  });
  it("splits all installment cents back to each responsible person without negative shares", () => {
    const f = fixture(); const owner = f.state.people[0].id, other = f.state.people[1].id;
    const state = applyCommand(f.state, f.purchase(101, 10, [{ person_id: owner, amount: 51 }, { person_id: other, amount: 50 }]));
    const amounts = state.charges.map(c => chargeShares(state, c));
    expect(amounts.flat().every(a => a.amount >= 0)).toBe(true);
    expect(amounts.reduce((s, a) => s + a[0].amount, 0)).toBe(51);
    expect(amounts.reduce((s, a) => s + a[1].amount, 0)).toBe(50);
  });
  it("applies partial payments and records credit after a subsequent full refund", () => {
    const f = fixture(); let state = applyCommand(f.state, f.purchase(60000, 10));
    const person = state.people[1].id;
    state = applyCommand(state, { id: id(), type: "reimburse", person_id: person, amount: 25000, received_at: "2026-10-10", note: "Pix" });
    expect(personBalance(state, person).balance).toBe(35000);
    state = applyCommand(state, { id: id(), type: "refund", purchase_id: state.purchases[0].id, amount: 60000, received_at: "2026-10-12", month: "2026-11", reason: "Devolução" });
    expect(personBalance(state, person).balance).toBe(-25000);
    expect(state.charges.reduce((s, c) => s + c.amount, 0)).toBe(0);
    expect(state.reimbursements).toHaveLength(1);
  });
  it("rejects invalid allocation, excess reimbursement and refund, preserving the input", () => {
    const f = fixture(); expect(() => applyCommand(f.state, f.purchase(100, 1, [{ person_id: f.state.people[0].id, amount: 99 }]))).toThrow("somar");
    expect(f.state.purchases).toHaveLength(0);
    const state = applyCommand(f.state, f.purchase(100, 1));
    expect(() => applyCommand(state, { id: id(), type: "reimburse", person_id: state.people[1].id, amount: 101, received_at: "2026-10-12", note: "" })).toThrow("excede");
    expect(() => applyCommand(state, { id: id(), type: "refund", purchase_id: state.purchases[0].id, amount: 101, received_at: "2026-10-12", month: "2026-11", reason: "Erro" })).toThrow("excede");
  });
  it("deduplicates command IDs, files and source IDs but preserves two identical legitimate purchases", () => {
    const f = fixture(); const command = f.purchase(); const state = applyCommand(f.state, command);
    expect(applyCommand(state, command)).toBe(state);
    const row = { merchant: "Mercado", purchase_date: "2026-10-01", amount: 10000, installments: 1, first_month: "2026-11", external_id: "", allow_similar: false };
    const imported = applyCommand(state, { id: id(), type: "import", card_id: state.cards[0].id, hash: "a".repeat(64), name: "compras.csv", rows: [row, row] });
    expect(imported.purchases).toHaveLength(3);
    expect(() => applyCommand(imported, { id: id(), type: "import", card_id: state.cards[0].id, hash: "a".repeat(64), name: "compras.csv", rows: [row] })).toThrow("já foi importado");
    expect(() => applyCommand(imported, { id: id(), type: "import", card_id: state.cards[0].id, hash: "b".repeat(64), name: "novo.csv", rows: [row] })).toThrow("duplicidade");
  });
  it("clamps short months and considers closing versus due month", () => {
    const card = fixture().state.cards[0];
    expect(suggestedMonth("2026-10-26", card)).toBe("2026-12");
    expect(suggestedMonth("2026-10-25", card)).toBe("2026-11");
  });
  it("reads quoted CSV fields and rejects negative payments or invalid dates", () => {
    const rows = parseCsv('data;descricao;valor;parcelas;primeira_fatura;id\n01/10/2026;"Loja; Centro";"1.200,00";6;2026-11;a');
    expect(rows[0].amount).toBe(120000); expect(rows[0].merchant).toBe("Loja; Centro");
    expect(() => parseCsv('data,descricao,valor,primeira_fatura\n2026-02-30,Loja,10,2026-03')).toThrow("Linha 2");
    expect(() => parseCsv('data,descricao,valor,primeira_fatura\n2026-10-01,Pagamento,-100,2026-11')).toThrow("Linha 2");
  });
});
