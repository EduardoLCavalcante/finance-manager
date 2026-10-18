import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-origin";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await serverSupabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/dashboard", origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", origin));
}
