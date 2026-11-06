import { NextRequest } from "next/server";

// Next.js builds request.url with its own address (in Docker, http://0.0.0.0:3000) and
// ignores Host and X-Forwarded-Host, so Auth.js would send people there. AUTH_URL would
// fix it for one address only, and the app must work from any computer without setup.
// Only nginx can reach the app (scripts/nginx.test.sh checks that the app publishes no
// ports) and it always sets these headers, so they can be trusted (#60). Remove this if
// Auth.js starts reading them.
export function withPublicUrl(req: NextRequest): NextRequest {
  const host = req.headers.get("x-forwarded-host");
  const protocol = req.headers.get("x-forwarded-proto");
  if (!host || (protocol !== "http" && protocol !== "https")) {
    return req;
  }
  try {
    const { protocol: publicProtocol, host: publicHost } = new URL(`${protocol}://${host}`);
    // Only the address changes: parsing the path again would read //evil.com as an address
    const url = new URL(req.url);
    url.protocol = publicProtocol;
    url.host = publicHost;
    return new NextRequest(url, req);
  } catch {
    // An invalid Host header: keep the request as it came
    return req;
  }
}
