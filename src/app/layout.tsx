import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
export const metadata: Metadata = { title: "Conta clara · Finanças pessoais", description: "Cartões, parcelas e despesas compartilhadas em um só lugar.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}<Toaster richColors position="top-right" closeButton /></body></html>; }
