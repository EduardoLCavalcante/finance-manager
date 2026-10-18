export type Institution = "nubank" | "inter" | "mercado-pago";
export type Card = { id: string; institution_id: Institution; name: string; last_four: string; closing_day: number; due_day: number };
export type Person = { id: string; name: string; is_owner: boolean };
export type Category = { id: string; name: string };
export type Purchase = { id: string; card_id: string; merchant: string; purchase_date: string; amount: number; installments: number; category_id: string | null; status: "pending" | "confirmed" };
export type Invoice = { id: string; card_id: string; month: string; closing_date: string; due_date: string; statement_total: number | null; paid_at: string | null };
export type Charge = { id: string; purchase_id: string; invoice_id: string; amount: number; installment_no: number; kind: "purchase" | "refund"; refund_id: string | null };
export type Allocation = { id: string; purchase_id: string; person_id: string; amount: number };
export type Refund = { id: string; purchase_id: string; amount: number; received_at: string; reason: string };
export type RefundAllocation = { id: string; refund_id: string; allocation_id: string; amount: number };
export type Reimbursement = { id: string; person_id: string; amount: number; received_at: string; note: string };
export type ReimbursementAllocation = { id: string; reimbursement_id: string; allocation_id: string; amount: number };
export type Source = { id: string; purchase_id: string; card_id: string; source_type: "manual" | "csv"; external_id: string; import_id: string | null };
export type ImportFile = { id: string; card_id: string; hash: string; name: string; created_at: string; row_count: number };
export type Audit = { id: string; action: string; created_at: string };
export type FinanceState = {
  revision: number; cards: Card[]; people: Person[]; categories: Category[]; purchases: Purchase[];
  invoices: Invoice[]; charges: Charge[]; allocations: Allocation[]; refunds: Refund[];
  refund_allocations: RefundAllocation[]; reimbursements: Reimbursement[];
  reimbursement_allocations: ReimbursementAllocation[]; sources: Source[]; imports: ImportFile[]; audit: Audit[];
};
export type Filters = { month: string; bank: string; card: string; category: string; person: string; search: string };
export const banks: Record<Institution, { name: string; letter: string; color: string }> = {
  nubank: { name: "Nubank", letter: "N", color: "#802bd6" },
  inter: { name: "Inter", letter: "I", color: "#f4741f" },
  "mercado-pago": { name: "Mercado Pago", letter: "M", color: "#168ad1" },
};
