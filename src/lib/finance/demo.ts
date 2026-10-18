import { applyCommand, emptyState } from "./engine";
import { addMonths, today } from "./money";
export function demoState() {
  let state = emptyState();
  const send = (command: Record<string, unknown>) => { state = applyCommand(state, { ...command, id: crypto.randomUUID() }); };
  send({ type: "add_card", institution_id: "nubank", name: "Nubank Platinum", last_four: "1234", closing_day: 24, due_day: 1 });
  send({ type: "add_card", institution_id: "inter", name: "Inter Gold", last_four: "5678", closing_day: 3, due_day: 10 });
  send({ type: "add_card", institution_id: "mercado-pago", name: "Mercado Pago", last_four: "9012", closing_day: 5, due_day: 12 });
  send({ type: "add_person", name: "Ana" });
  send({ type: "add_person", name: "Carlos" });
  const month = today().slice(0, 7);
  const owner = state.people[0].id, ana = state.people[1].id, carlos = state.people[2].id;
  const buy = (merchant: string, amount: number, installments: number, card: number, category: string, start: number, shares: [string, number][]) => send({ type: "add_purchase", merchant, amount, installments, card_id: state.cards[card].id, category_id: state.categories.find(c => c.name === category)!.id, purchase_date: `${addMonths(month, start)}-01`, first_month: addMonths(month, start), allocations: shares.map(([person_id, amount]) => ({ person_id, amount })) });
  buy("Mercado Livre", 179940, 6, 0, "Compras", -1, [[owner, 119940], [ana, 60000]]);
  buy("Supermercado", 48245, 1, 1, "Alimentação", 0, [[owner, 48245]]);
  buy("Amazon", 419000, 10, 0, "Eletrônicos", -2, [[ana, 419000]]);
  buy("Farmácia", 9630, 1, 2, "Saúde", 0, [[owner, 9630]]);
  buy("Restaurante", 24150, 1, 1, "Alimentação", 0, [[owner, 8050], [ana, 8050], [carlos, 8050]]);
  buy("Seguro do carro", 240000, 12, 2, "Serviços", -3, [[owner, 240000]]);
  buy("Passagens aéreas", 324000, 6, 1, "Lazer", 0, [[owner, 162000], [carlos, 162000]]);
  send({ type: "reimburse", person_id: ana, amount: 25000, received_at: today(), note: "Pix parcial" });
  return state;
}
