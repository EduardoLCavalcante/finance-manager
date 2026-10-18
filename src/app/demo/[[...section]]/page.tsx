import { notFound } from "next/navigation";
import { FinanceApp } from "@/components/finance/app";
export default async function Demo({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  const page = section?.[0] ?? "dashboard";
  if ((section?.length ?? 0) > 1 || !["dashboard", "transactions", "unassigned", "cards", "invoices", "people", "reimbursements", "settings"].includes(page)) notFound();
  return <FinanceApp section={page} demo />;
}
