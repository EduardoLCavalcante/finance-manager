"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { browserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { FormField } from "@/components/finance/forms";
export default function Login() {
  const [signup, setSignup] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const db = browserSupabase();
      const credentials = { email: String(data.get("email")), password: String(data.get("password")) };
      const result = signup ? await db.auth.signUp({ ...credentials, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } }) : await db.auth.signInWithPassword(credentials);
      if (result.error) { setMessage(signup ? "Não foi possível criar a conta. Confira os dados ou tente novamente mais tarde." : "Não foi possível entrar. Confira e-mail, senha e a confirmação do e-mail."); return; }
      if (result.data.session) window.location.assign("/dashboard");
      else setMessage("Confira seu e-mail para confirmar o cadastro. Depois, volte para entrar.");
    } catch { setMessage("Não foi possível conectar. Tente novamente."); } finally { setBusy(false); }
  }
  return <main className="login-page"><div className="login-brand"><Link href="/login" className="wordmark"><span className="brand-icon" />conta clara</Link></div><section className="login-card"><div className="login-symbol"><ShieldCheck size={30} /></div><h1>{signup ? "Comece a organizar." : "Seu dinheiro, mais claro."}</h1><p>{signup ? "Crie sua conta para reunir cartões, compras e despesas compartilhadas." : "Entre para acompanhar suas faturas e o que cada pessoa deve."}</p>
    {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
    <form onSubmit={submit}><FieldGroup><FormField label="E-mail"><Input type="email" name="email" autoComplete="email" placeholder="voce@exemplo.com" required /></FormField><FormField label="Senha" hint={signup ? "Use ao menos 8 caracteres." : undefined}><Input name="password" type="password" minLength={8} autoComplete={signup ? "new-password" : "current-password"} required /></FormField></FieldGroup><Button type="submit" disabled={busy} className="login-submit">{busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}<ArrowRight /></Button></form>
    <Button variant="link" disabled={busy} onClick={() => { setSignup(!signup); setMessage(""); }}>{signup ? "Já tenho conta. Entrar" : "Criar uma conta"}</Button><div className="login-demo"><Link href="/demo">Explorar demonstração <ArrowRight size={15} /></Link><small>Conheça os recursos com dados de exemplo.</small></div>
  </section><p className="login-caption">Cada despesa no seu lugar.</p></main>;
}
