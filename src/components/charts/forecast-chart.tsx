"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { money } from "@/lib/finance/money";
export default function ForecastChart({ data }: { data: { month: string; propria: number; terceiros: number; pendente: number }[] }) {
  return <div className="chart" role="img" aria-label="Previsão das próximas seis faturas, separada entre despesas próprias, de terceiros e pendentes de atribuição."><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 18, right: 20, left: 2, bottom: 2 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="#e7ebf0" vertical={false} />
    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={10} />
    <YAxis axisLine={false} tickLine={false} width={68} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={v => `R$ ${v >= 1000 ? `${(v / 1000).toFixed(1)} mil` : v}`} />
    <Tooltip formatter={v => money(Math.round(Number(v) * 100))} contentStyle={{ borderRadius: 10, border: "1px solid #e4e9ef", fontSize: 13 }} />
    <Line name="Minha parte" dataKey="propria" stroke="#117956" strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 2, fill: "white" }} isAnimationActive={false} />
    <Line name="Parte de terceiros" dataKey="terceiros" stroke="#8255d9" strokeWidth={2.5} dot={{ r: 3.5 }} isAnimationActive={false} />
    {data.some(d => d.pendente !== 0) ? <Line name="A atribuir" dataKey="pendente" stroke="#c58b21" strokeWidth={2} strokeDasharray="4 4" isAnimationActive={false} /> : null}
  </LineChart></ResponsiveContainer></div>;
}
