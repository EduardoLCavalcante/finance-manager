import { z } from "zod";
const id = z.uuid();
const text = z.string().trim().min(1).max(160);
export const amountSchema = z.number().int().positive().max(999999999999);
export const dateSchema = z.iso.date().refine(d => d >= "2000-01-01" && d <= "2100-12-31", "Data fora do intervalo permitido.");
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const share = z.object({ person_id: id, amount: amountSchema });
export const importRowSchema = z.object({ merchant: text, purchase_date: dateSchema, amount: amountSchema, installments: z.number().int().min(1).max(120), first_month: monthSchema, external_id: z.string().max(200), allow_similar: z.boolean().default(false) });
const base = { id };
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("add_card"), institution_id: z.enum(["nubank", "inter", "mercado-pago"]), name: text, last_four: z.string().regex(/^\d{4}$/), closing_day: z.number().int().min(1).max(31), due_day: z.number().int().min(1).max(31) }),
  z.object({ ...base, type: z.literal("add_person"), name: text }),
  z.object({ ...base, type: z.literal("add_category"), name: text }),
  z.object({ ...base, type: z.literal("add_purchase"), card_id: id, merchant: text, purchase_date: dateSchema, amount: amountSchema, installments: z.number().int().min(1).max(120), first_month: monthSchema, category_id: id.nullable(), allocations: z.array(share).min(1).max(30) }),
  z.object({ ...base, type: z.literal("classify"), purchase_id: id, category_id: id.nullable(), allocations: z.array(share).min(1).max(30) }),
  z.object({ ...base, type: z.literal("refund"), purchase_id: id, amount: amountSchema, received_at: dateSchema, month: monthSchema, reason: text }),
  z.object({ ...base, type: z.literal("reimburse"), person_id: id, amount: amountSchema, received_at: dateSchema, note: z.string().trim().max(300) }),
  z.object({ ...base, type: z.literal("statement"), invoice_id: id, statement_total: z.number().int().min(-999999999999).max(999999999999).nullable(), paid_at: dateSchema.nullable() }),
  z.object({ ...base, type: z.literal("import"), card_id: id, hash: z.string().regex(/^[a-f0-9]{64}$/), name: text, rows: z.array(importRowSchema).min(1).max(1000) }),
]);
export type Command = z.infer<typeof commandSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
