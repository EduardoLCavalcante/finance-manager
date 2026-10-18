import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function serverSupabase() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: values => {
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
      catch { /* Server components rely on the proxy to refresh cookies. */ }
    } },
  });
}
