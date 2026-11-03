import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaMembershipRepository } from "@/lib/permissions/membership-repository";
import type { PrismaClient } from "@/generated/prisma/client";

describe("PrismaMembershipRepository", () => {
  const mockPrismaMembership = { findUnique: vi.fn() };
  const mockDb = { membership: mockPrismaMembership } as unknown as PrismaClient;
  const repo = new PrismaMembershipRepository(mockDb);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks up the membership by user and club and returns only its role", async () => {
    mockPrismaMembership.findUnique.mockResolvedValueOnce({ role: "athlete" });

    const role = await repo.findRole("u1", "club-1");

    expect(mockPrismaMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_orgId: { userId: "u1", orgId: "club-1" } },
      select: { role: true },
    });
    expect(role).toBe("athlete");
  });

  it("returns null when the user is not a member of the club", async () => {
    mockPrismaMembership.findUnique.mockResolvedValueOnce(null);

    const role = await repo.findRole("u1", "club-1");

    expect(role).toBeNull();
  });
});
