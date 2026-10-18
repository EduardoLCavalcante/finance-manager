import Papa from "papaparse";
import { cents } from "@/lib/finance/money";
import { importRowSchema, type ImportRow } from "@/lib/finance/schema";

export function parseCsv(text: string): ImportRow[] {
  if (text.length > 1000000) throw new Error("Use arquivos de até 1 MB.");
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: h => h.trim().toLowerCase() });
  if (result.errors.length) throw new Error(`CSV inválido: ${result.errors[0].message}`);
  const columns = result.meta.fields ?? [];
  if (!["data", "descricao", "valor", "primeira_fatura"].every(c => columns.includes(c))) throw new Error("Use o modelo CSV: data, descricao, valor, parcelas, primeira_fatura e id. Cada linha deve representar uma compra completa.");
  if (!result.data.length || result.data.length > 1000) throw new Error("O arquivo deve conter entre 1 e 1.000 compras.");
  return result.data.map((row, index) => {
    try {
      const date = /^\d{2}\/\d{2}\/\d{4}$/.test(row.data) ? row.data.split("/").reverse().join("-") : row.data;
      return importRowSchema.parse({ merchant: row.descricao, purchase_date: date, amount: cents(row.valor), installments: Number(row.parcelas || 1), first_month: row.primeira_fatura, external_id: (row.id ?? "").trim(), allow_similar: false });
    } catch { throw new Error(`Linha ${index + 2}: confira a data, o valor positivo, a quantidade de parcelas e a primeira fatura (AAAA-MM). Pagamentos de fatura e estornos não são compras; registre-os nas telas próprias.`); }
  });
}
export async function fileHash(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
}
