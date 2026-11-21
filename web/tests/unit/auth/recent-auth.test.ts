import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

import { isRecentAuth, RECENT_AUTH_WINDOW_SECONDS } from "@/lib/auth/recent-auth";

describe("isRecentAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when authTime is within the 5-minute window", async () => {
    authMock.mockResolvedValue({ authTime: 1000 });
    expect(await isRecentAuth(1000 + RECENT_AUTH_WINDOW_SECONDS)).toBe(true);
  });

  it("returns false when authTime is older than the 5-minute window", async () => {
    authMock.mockResolvedValue({ authTime: 1000 });
    expect(await isRecentAuth(1000 + RECENT_AUTH_WINDOW_SECONDS + 1)).toBe(false);
  });

  it("returns false when session or authTime is missing", async () => {
    authMock.mockResolvedValueOnce(null);
    expect(await isRecentAuth(1000)).toBe(false);

    authMock.mockResolvedValueOnce({});
    expect(await isRecentAuth(1000)).toBe(false);
  });
});
