"use client";
import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { banks, type Card } from "@/lib/finance/types";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
export function BankMark({ card }: { card: Card }) {
  const bank = banks[card.institution_id];
  return <span className="bank-mark" style={{ backgroundColor: bank.color }} aria-hidden="true">{bank.letter}</span>;
}
export function CardName({ card }: { card: Card }) { return <div className="card-name"><BankMark card={card} /><span><strong>{banks[card.institution_id].name}</strong><small>•••• {card.last_four}</small></span></div>; }
export function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function Blank({ title, description, onAction, action }: { title: string; description: string; onAction?: () => void; action?: string }) {
  return <Empty><EmptyHeader><EmptyMedia variant="icon"><CircleHelp /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{onAction ? <Button onClick={onAction}>{action}</Button> : null}</Empty>;
}
export function SelectField({ label, value, onChange, children, required = false, name }: { label: string; value?: string; onChange?: (v: string) => void; children: ReactNode; required?: boolean; name?: string }) {
  return <label className="select-field"><span className="sr-only">{label}</span><select aria-label={label} name={name} value={value} onChange={e => onChange?.(e.target.value)} required={required}>{children}</select></label>;
}
