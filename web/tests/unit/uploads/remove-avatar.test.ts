// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { removeAvatar } from "@/lib/uploads/remove-avatar";

describe("removeAvatar", () => {
  it("locks user, deletes avatar rows, sets image to null and cleans up files", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const queries: string[] = [];

    const fakeTx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        queries.push(strings.join("?"));
        return [];
      }),
      avatar: {
        findMany: vi.fn(async () => [{ path: "avatars/sample.png" }]),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      user: {
        update: vi.fn(async () => ({ id: userId, image: null })),
      },
    };

    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: typeof fakeTx) => Promise<unknown>) => cb(fakeTx)),
    };

    const fakeDeleteFiles = vi.fn(async () => 0);

    const result = await removeAvatar(userId, fakeDb as never, "/fake/uploads", fakeDeleteFiles);

    expect(result).toEqual({ removed: true });
    expect(fakeDb.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
    });
    expect(queries[0]).toContain("SELECT id FROM users");
    expect(queries[0]).toContain("FOR UPDATE");
    expect(fakeTx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      fakeTx.avatar.findMany.mock.invocationCallOrder[0],
    );
    expect(fakeTx.avatar.deleteMany).toHaveBeenCalledWith({ where: { ownerId: userId } });
    expect(fakeTx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { image: null },
    });
    expect(fakeDeleteFiles).toHaveBeenCalledWith(["avatars/sample.png"], "/fake/uploads");
  });

  it("handles user without avatars cleanly without calling deleteMany", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const fakeTx = {
      $queryRaw: vi.fn(async () => []),
      avatar: {
        findMany: vi.fn(async () => []),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      user: {
        update: vi.fn(async () => ({ id: userId, image: null })),
      },
    };
    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: typeof fakeTx) => Promise<unknown>) => cb(fakeTx)),
    };
    const fakeDeleteFiles = vi.fn(async () => 0);

    const result = await removeAvatar(userId, fakeDb as never, "/fake/uploads", fakeDeleteFiles);

    expect(result).toEqual({ removed: true });
    expect(fakeTx.avatar.deleteMany).not.toHaveBeenCalled();
    expect(fakeDeleteFiles).toHaveBeenCalledWith([], "/fake/uploads");
  });

  it("warns and returns avatarCleanupFailed when file removal fails", async () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeTx = {
      $queryRaw: vi.fn(async () => []),
      avatar: {
        findMany: vi.fn(async () => [{ path: "avatars/sample.png" }]),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      user: {
        update: vi.fn(async () => ({ id: userId, image: null })),
      },
    };
    const fakeDb = {
      $transaction: vi.fn(async (cb: (tx: typeof fakeTx) => Promise<unknown>) => cb(fakeTx)),
    };
    const fakeDeleteFiles = vi.fn(async () => 1);

    const result = await removeAvatar(userId, fakeDb as never, "/fake/uploads", fakeDeleteFiles);

    expect(result).toEqual({ removed: true, avatarCleanupFailed: 1 });
    expect(warnSpy).toHaveBeenCalledWith("Avatar removed, but 1 file(s) could not be deleted");
    warnSpy.mockRestore();
  });
});
