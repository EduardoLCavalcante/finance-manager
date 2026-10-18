import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "../src/lib/request-origin";

describe("request origin", () => {
  const url = "http://0.0.0.0:3010/api/test";
  it.each<Record<string, string>>([
    { origin: "http://localhost:3010", host: "localhost:3010" },
    { origin: "http://127.0.0.1:3010", host: "127.0.0.1:3010" },
    { origin: "http://0.0.0.0:3010" },
    { origin: "https://finance.example", host: "internal:3010", "x-forwarded-host": "finance.example", "x-forwarded-proto": "https" },
    {},
    { "sec-fetch-site": "same-origin" },
  ])("accepts the public origin or clients without an Origin header: %j", headers => {
    expect(isAllowedOrigin(new Request(url, { headers: new Headers(headers) }))).toBe(true);
  });
  it.each<Record<string, string>>([
    { origin: "https://evil.example", host: "localhost:3010" },
    { origin: "http://localhost:3011", host: "localhost:3010" },
    { origin: "https://localhost:3010", host: "localhost:3010" },
    { origin: "http://0.0.0.0:3010", host: "localhost:3010" },
    { origin: "null", host: "localhost:3010" },
    { origin: "not-a-url", host: "localhost:3010" },
    { origin: "http://localhost:3010", host: "localhost:3010", "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "cross-site" },
    { origin: "http://localhost:3010", host: "localhost:3010", "x-forwarded-host": "public.example" },
    { origin: "http://localhost:3010", "x-forwarded-host": "localhost:3010, evil.example" },
    { origin: "http://localhost:3010", host: "localhost:3010", "x-forwarded-proto": "http, https" },
  ])("rejects different, malformed or cross-site origins: %j", headers => {
    expect(isAllowedOrigin(new Request(url, { headers: new Headers(headers) }))).toBe(false);
  });
});
