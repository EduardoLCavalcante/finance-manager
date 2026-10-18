import { notFound } from "next/navigation";
import { FinanceApp } from "@/components/finance/app";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!["dashboard", "transactions", "cards", "invoices", "people", "reimbursements", "settings"].includes(section)) notFound();
  return <FinanceApp section={section} />;
}
