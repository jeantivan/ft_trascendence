import { beforeEach, describe, expect, it, vi } from "vitest";
import { signOut } from "@/auth";
import { GET } from "@/app/auth/signed-out/route";

vi.mock("@/auth", () => ({ signOut: vi.fn() }));

function requestTo(path: string) {
  return new Request(`http://localhost${path}`);
}

describe("GET /auth/signed-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs out and sends a blocked user to /login?error=blocked", async () => {
    await GET(requestTo("/auth/signed-out?reason=blocked"));

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login?error=blocked" });
  });

  it("signs out and sends a user without reason to /login", async () => {
    await GET(requestTo("/auth/signed-out"));

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("ignores an unknown reason and sends the user to /login", async () => {
    await GET(requestTo("/auth/signed-out?reason=hacked"));

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
