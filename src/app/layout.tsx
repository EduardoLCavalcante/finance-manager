import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";
export const metadata: Metadata = {
  title: "Conta clara · Finanças pessoais", description: "Cartões, parcelas e despesas compartilhadas em um só lugar.",
  applicationName: "Conta clara", robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Conta clara", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
};
export const viewport: Viewport = { themeColor: "#117956" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}<PwaRegistration /><Toaster richColors position="top-right" closeButton /></body></html>; }
