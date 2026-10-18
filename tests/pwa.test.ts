import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import manifest from "../src/app/manifest";

const publicDir = new URL("../public/", import.meta.url);
function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cache = { addAll: vi.fn().mockResolvedValue(undefined) };
  const caches = { open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue(["conta-clara-static-v0", "conta-clara-static-v1", "other-app"]), delete: vi.fn().mockResolvedValue(true), match: vi.fn() };
  const fetch = vi.fn();
  const self = { location: { origin: "https://conta.example" }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; }, skipWaiting: vi.fn().mockResolvedValue(undefined), clients: { claim: vi.fn().mockResolvedValue(undefined) } };
  runInNewContext(readFileSync(new URL("sw.js", publicDir), "utf8"), { self, caches, fetch, URL, Response });
  const request = (path: string, mode = "cors", method = "GET") => {
    const event = { request: { url: new URL(path, self.location.origin).href, mode, method }, respondWith: vi.fn() };
    handlers.fetch(event);
    return event;
  };
  return { handlers, cache, caches, fetch, self, request };
}

describe("production PWA", () => {
  it("declares installable PNG icons with real matching dimensions and a maskable icon", () => {
    const data = manifest();
    expect(data).toMatchObject({ id: "/", start_url: "/dashboard", scope: "/", display: "standalone", lang: "pt-BR" });
    expect(data.icons?.some(icon => icon.purpose === "maskable")).toBe(true);
    for (const icon of data.icons!) {
      const png = readFileSync(new URL(icon.src.slice(1), publicDir));
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
    const apple = readFileSync(new URL("icons/apple-touch-icon.png", publicDir));
    expect(apple.readUInt32BE(16)).toBe(180);
    expect(apple.readUInt32BE(20)).toBe(180);
    expect(existsSync(fileURLToPath(new URL("favicon.ico", publicDir)))).toBe(true);
  });
  it("precaches only the public offline screen and icons", async () => {
    const w = worker(), waitUntil = vi.fn();
    w.handlers.install({ waitUntil });
    await waitUntil.mock.calls[0][0];
    const assets = Array.from(w.cache.addAll.mock.calls[0][0]) as string[];
    expect(assets).toContain("/offline.html");
    expect(assets.every(path => path === "/offline.html" || path === "/icon.svg" || path === "/favicon.ico" || path.startsWith("/icons/"))).toBe(true);
    expect(w.self.skipWaiting).toHaveBeenCalledOnce();
  });
  it("cleans only outdated app caches and claims clients", async () => {
    const w = worker(), waitUntil = vi.fn();
    w.handlers.activate({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(w.caches.delete.mock.calls).toEqual([["conta-clara-static-v0"]]);
    expect(w.self.clients.claim).toHaveBeenCalledOnce();
  });
  it("always requests navigations from the network without caching the account HTML", async () => {
    const w = worker(), response = new Response("private dashboard");
    w.fetch.mockResolvedValue(response);
    const event = w.request("/dashboard", "navigate");
    expect(await event.respondWith.mock.calls[0][0]).toBe(response);
    expect(w.fetch).toHaveBeenCalledOnce();
    expect(w.cache.addAll).not.toHaveBeenCalled();
    expect(w.caches.match).not.toHaveBeenCalled();
  });
  it("returns the public offline screen when a navigation cannot reach the network", async () => {
    const w = worker(), offline = new Response("Você está sem conexão.");
    w.fetch.mockRejectedValue(new TypeError("Network error"));
    w.caches.match.mockResolvedValue(offline);
    const event = w.request("/unassigned", "navigate");
    expect(await event.respondWith.mock.calls[0][0]).toBe(offline);
    expect(w.caches.match).toHaveBeenCalledWith("/offline.html", { cacheName: "conta-clara-static-v1" });
  });
  it("returns a safe fallback if the offline cache has been evicted", async () => {
    const w = worker();
    w.fetch.mockRejectedValue(new TypeError("Network error"));
    w.caches.match.mockResolvedValue(undefined);
    const event = w.request("/invoices", "navigate");
    const response = await event.respondWith.mock.calls[0][0];
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Sem conexão");
  });
  it.each([
    ["/api/finance", "cors", "GET"], ["/api/integrations/pluggy/sync", "cors", "POST"],
    ["/dashboard?_rsc=private", "cors", "GET"], ["/login", "cors", "GET"],
    ["https://project.supabase.co/auth/v1/user", "cors", "GET"],
  ])("does not intercept private/API/RSC requests: %s", (path, mode, method) => {
    const w = worker(), event = w.request(path, mode, method);
    expect(event.respondWith).not.toHaveBeenCalled();
    expect(w.caches.match).not.toHaveBeenCalled();
  });
  it("serves a cached public icon without a network request", async () => {
    const w = worker(), icon = new Response("png");
    w.caches.match.mockResolvedValue(icon);
    const event = w.request("/icons/icon-192.png");
    expect(await event.respondWith.mock.calls[0][0]).toBe(icon);
    expect(w.fetch).not.toHaveBeenCalled();
  });
});
