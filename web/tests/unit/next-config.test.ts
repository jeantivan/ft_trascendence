import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// next dev logs every request with its whole address, "?" part included (#185).
// The data export download (#165) carries a token there, so that route is left out.
// Next.js tests each pattern against the path plus the "?" part (request.url)
function isLogged(url: string): boolean {
  const incoming = nextConfig.logging ? nextConfig.logging.incomingRequests : undefined;
  const ignore = typeof incoming === "object" ? (incoming.ignore ?? []) : [];
  return !ignore.some((pattern) => pattern.test(url));
}

describe("next dev request logging", () => {
  it("leaves out the download route, with or without a token", () => {
    expect(isLogged("/api/gdpr/export/abc/download?token=secret")).toBe(false);
    expect(isLogged("/api/gdpr/export/abc/download")).toBe(false);
    expect(isLogged("/api/gdpr/export/abc/download/?token=secret")).toBe(false);
    expect(isLogged("/api/gdpr/export/abc/download/?other=secret")).toBe(false);
  });

  it("leaves out the download route when the id has a slash, like nginx (#202)", () => {
    // nginx/app.conf takes any id, so next dev must leave out at least the same links
    expect(isLogged("/api/gdpr/export/a/b/download?other=secret")).toBe(false);
    expect(isLogged("/api/gdpr/export/a%2Fb/download?other=secret")).toBe(false);
    // next dev sees "?" still encoded inside the id, so "[^?]+" takes it
    expect(isLogged("/api/gdpr/export/a%3Fb/download?other=secret")).toBe(false);
  });

  it("leaves out any route whose link carries a token parameter", () => {
    expect(isLogged("/verify-email?token=secret")).toBe(false);
    expect(isLogged("/any/route?lang=es&token=secret")).toBe(false);
    expect(isLogged("/page?Token=secret")).toBe(false);
  });

  it("leaves out a token hidden in another parameter, such as callbackUrl", () => {
    // Without a session, a page sends the visitor to /login with its whole address
    // encoded in callbackUrl (auth.config.ts): "?" is %3F, "=" is %3D, "&" is %26
    expect(isLogged("/login?callbackUrl=%2Fverify-email%3Ftoken%3Dsecret")).toBe(false);
    expect(isLogged("/login?callbackUrl=%2Fpage%3Flang%3Des%26token%3Dsecret")).toBe(false);
    // Encoded twice ("%" becomes %25): an address that was already encoded once
    expect(isLogged("/login?callbackUrl=%2Fpage%253Ftoken%253Dsecret")).toBe(false);
  });

  it("keeps logging the other routes", () => {
    expect(isLogged("/login")).toBe(true);
    expect(isLogged("/login?callbackUrl=%2Fdashboard")).toBe(true);
    expect(isLogged("/api/gdpr/export/abc")).toBe(true);
    expect(isLogged("/api/gdpr/export/abc/download-other")).toBe(true);
    // Only a parameter named exactly "token" counts
    expect(isLogged("/page?csrftoken=x")).toBe(true);
    expect(isLogged("/page?tokens=x")).toBe(true);
  });
});
