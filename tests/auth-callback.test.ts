import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));
vi.mock("../src/lib/supabase/server", () => ({ serverSupabase: async () => ({ auth }) }));
import { GET } from "../src/app/auth/callback/route";

beforeEach(() => { vi.clearAllMocks(); auth.exchangeCodeForSession.mockResolvedValue({ error: null }); });
describe("authentication callback behind a production proxy", () => {
  it("redirects a successful code exchange to the public HTTPS origin", async () => {
    const request = new Request("http://0.0.0.0:3000/auth/callback?code=confirmation", { headers: { "x-forwarded-host": "conta.example", "x-forwarded-proto": "https" } });
    const response = await GET(request);
    expect(response.headers.get("location")).toBe("https://conta.example/dashboard");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("confirmation");
  });
  it("keeps failed confirmations on the public origin", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: "Invalid code" } });
    const response = await GET(new Request("http://internal:3000/auth/callback?code=invalid", { headers: { "x-forwarded-host": "conta.example", "x-forwarded-proto": "https" } }));
    expect(response.headers.get("location")).toBe("https://conta.example/login?error=confirmation");
  });
  it("uses the request host locally without exchanging a missing code", async () => {
    const response = await GET(new Request("http://0.0.0.0:3011/auth/callback", { headers: { host: "localhost:3011" } }));
    expect(response.headers.get("location")).toBe("http://localhost:3011/login?error=confirmation");
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("uses the URL origin when there is no proxy or Host header", async () => {
    const response = await GET(new Request("https://conta.example/auth/callback?code=confirmation"));
    expect(response.headers.get("location")).toBe("https://conta.example/dashboard");
  });
});
