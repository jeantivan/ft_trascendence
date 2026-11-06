// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { withPublicUrl } from "@/lib/auth/public-url";

const INTERNAL = "http://0.0.0.0:3000";

function forwarded(host: string, proto = "https") {
  return { "x-forwarded-host": host, "x-forwarded-proto": proto };
}

describe("withPublicUrl", () => {
  it("uses the address nginx reports, keeping the path and the query", () => {
    const req = new NextRequest(`${INTERNAL}/dashboard?tab=1`, { headers: forwarded("10.11.1.5:8443") });

    expect(withPublicUrl(req).url).toBe("https://10.11.1.5:8443/dashboard?tab=1");
  });

  it.each(["//evil.com/dashboard", "/\\evil.com/dashboard"])(
    "never takes the address from a path like %s",
    (path) => {
      const req = new NextRequest(`${INTERNAL}${path}`, { headers: forwarded("localhost:8443") });

      expect(new URL(withPublicUrl(req).url).host).toBe("localhost:8443");
    },
  );

  it("keeps the method, the headers and the body", async () => {
    const req = new NextRequest(`${INTERNAL}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { ...forwarded("localhost:8443"), cookie: "a=1" },
      body: "email=runner",
    });

    const result = withPublicUrl(req);

    expect(result.method).toBe("POST");
    expect(result.headers.get("cookie")).toBe("a=1");
    await expect(result.text()).resolves.toBe("email=runner");
  });

  it.each([
    ["no forwarded headers", {}],
    ["no forwarded host", { "x-forwarded-proto": "https" }],
    ["no forwarded protocol", { "x-forwarded-host": "localhost:8443" }],
    ["an unexpected protocol", forwarded("localhost:8443", "javascript")],
    ["an invalid host", forwarded("not a host")],
  ])("leaves the request as it is with %s", (_case, headers) => {
    const req = new NextRequest(`${INTERNAL}/dashboard`, { headers });

    expect(withPublicUrl(req).url).toBe(`${INTERNAL}/dashboard`);
  });
});
