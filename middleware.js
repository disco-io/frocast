// Vercel Routing Middleware (wired up in vercel.json "proxy"): staff pages open only on a
// paired device. Everything else (pair.html, css, js, public files) passes through.
// The api functions do their own checks, including revoked devices.
import { deviceFromCookie } from "./api/_lib/token.js";

// Same response that next() from @vercel/functions builds: "continue to the page".
export const next = () => new Response(null, { headers: { "x-middleware-next": "1" } });

export default async function middleware(request) {
  const url = new URL(request.url);
  try {
    const device = await deviceFromCookie(request.headers.get("cookie"));
    if (device && device.location === (process.env.LOCATION_ID || "nassau-st")) return next();
  } catch (err) {
    console.error("middleware", err.message);
  }
  const to = new URL("/pair.html", url);
  to.searchParams.set("next", url.pathname + url.search);
  return Response.redirect(to, 302);
}
