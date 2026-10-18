export const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export function cents(value: string): number {
  const normalized = value.trim().replace(/^R\$\s*/, "");
  const decimal = normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized;
  if (!/^-?\d+(\.\d{1,2})?$/.test(decimal)) throw new Error("Informe um valor válido, com até duas casas decimais.");
  const negative = decimal.startsWith("-");
  const [whole, fraction = ""] = decimal.replace("-", "").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 999999999999) throw new Error("Valor fora do limite permitido.");
  return negative ? -result : result;
}
export const inputMoney = (value: number) => (value / 100).toFixed(2).replace(".", ",");
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function addMonths(month: string, offset: number) {
  const [year, m] = month.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}
export function monthLabel(month: string, short = false) {
  return new Intl.DateTimeFormat("pt-BR", { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
}
export function dateLabel(date: string) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`)); }
export function monthDate(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function splitEvenly(total: number, count: number) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => base + (i < total % count ? 1 : 0));
}
// Largest remainders preserve cents even when a shared purchase does not divide evenly.
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const positive = Math.abs(total);
  const denominator = BigInt(sum);
  const products = weights.map(w => BigInt(positive) * BigInt(w));
  const result = products.map(p => Number(p / denominator));
  const order = products.map((p, i) => ({ i, r: p % denominator })).sort((a, b) => a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1);
  const remainder = positive - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remainder; i++) result[order[i].i]++;
  return result.map(n => total < 0 ? -n : n);
}
