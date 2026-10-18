export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  // Next.js may use the bind address in request.url instead of the browser's host.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}
export function isAllowedOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === requestOrigin(request);
}
