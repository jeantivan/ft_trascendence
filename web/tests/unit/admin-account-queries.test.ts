import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccount, listAccounts } from "@/lib/admin/accounts";
import { getAccountForAdmin, getAccountsPageForAdmin } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/permissions/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin/accounts", () => ({ listAccounts: vi.fn(), getAccount: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// requireAdmin ends by throwing (redirect or forbidden) when it does not let you in
class ForbiddenSignal extends Error {}

const SESSION_ADMIN = { id: "admin-from-session", email: "a@b.c", nick: "Admin", roleGlobal: "admin" as const };
const ACCOUNT_ID = "a0000000-0000-4000-8000-000000000301";

describe("Admin panel reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(SESSION_ADMIN);
    vi.mocked(listAccounts).mockResolvedValue({ accounts: [], hasNextPage: false });
  });

  it("someone who is not an Admin stops at requireAdmin and the list is not read", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenSignal());

    await expect(getAccountsPageForAdmin("1")).rejects.toBeInstanceOf(ForbiddenSignal);

    expect(listAccounts).not.toHaveBeenCalled();
  });

  it("?page=2 asks for page 2, and says which page it is for the links", async () => {
    const result = await getAccountsPageForAdmin("2");

    expect(listAccounts).toHaveBeenCalledWith(prisma, { page: 2 });
    expect(result.page).toBe(2);
  });

  it("a malformed ?page= says page 1, the one it shows", async () => {
    const result = await getAccountsPageForAdmin("abc");

    expect(result.page).toBe(1);
  });

  // Next gives each search param as text, as a list when it is repeated, or nothing
  it.each([["abc"], ["-3"], ["0"], ["2.5"], [""], [" 2"], [undefined], [["2", "3"]]])(
    "?page=%j asks for page 1 instead of failing",
    async (pageParam) => {
      await getAccountsPageForAdmin(pageParam);

      expect(listAccounts).toHaveBeenCalledWith(prisma, { page: 1 });
    },
  );

  it("someone who is not an Admin stops at requireAdmin and the account is not read", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenSignal());

    await expect(getAccountForAdmin(ACCOUNT_ID)).rejects.toBeInstanceOf(ForbiddenSignal);

    expect(getAccount).not.toHaveBeenCalled();
  });

  it("an Admin gets the account the address names", async () => {
    vi.mocked(getAccount).mockResolvedValue(null);

    const account = await getAccountForAdmin(ACCOUNT_ID);

    expect(account).toBeNull();
    expect(getAccount).toHaveBeenCalledWith(prisma, ACCOUNT_ID);
  });

  it("says whether the account is the Admin's own, so the page does not offer to block it", async () => {
    const detail = {
      email: "x@demo.local",
      nick: null,
      roleGlobal: "user" as const,
      blockedAt: null,
      createdAt: new Date(),
      clubs: [],
    };
    vi.mocked(getAccount).mockResolvedValueOnce({ ...detail, id: ACCOUNT_ID });
    vi.mocked(getAccount).mockResolvedValueOnce({ ...detail, id: SESSION_ADMIN.id });

    expect((await getAccountForAdmin(ACCOUNT_ID))?.isSelf).toBe(false);
    expect((await getAccountForAdmin(SESSION_ADMIN.id))?.isSelf).toBe(true);
  });
});
