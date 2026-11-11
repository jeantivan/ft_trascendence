import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockAccountAction, unblockAccountAction, updateAccountNickAction } from "@/lib/admin/actions";
import { blockAccount, unblockAccount, updateAccountNick } from "@/lib/admin/accounts";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/permissions/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin/accounts", () => ({
  blockAccount: vi.fn(),
  unblockAccount: vi.fn(),
  updateAccountNick: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// requireAdmin ends by throwing (redirect or forbidden) when it does not let you in
class ForbiddenSignal extends Error {}

const SESSION_ADMIN = { id: "admin-from-session", email: "a@b.c", nick: "Admin", roleGlobal: "admin" as const };
const ACCOUNT_ID = "a0000000-0000-4000-8000-000000000301";

function formWith(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  return form;
}

describe("Admin account actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(SESSION_ADMIN);
  });

  it("block: the Admin comes from the session, the account from the form", async () => {
    vi.mocked(blockAccount).mockResolvedValue({ ok: true, changed: true });

    const result = await blockAccountAction(null, formWith({ accountId: ACCOUNT_ID }));

    expect(result).toEqual({ ok: true, changed: true });
    expect(blockAccount).toHaveBeenCalledWith(prisma, { adminId: "admin-from-session", accountId: ACCOUNT_ID });
  });

  it("block: an adminId sent in the form is ignored", async () => {
    vi.mocked(blockAccount).mockResolvedValue({ ok: true, changed: true });

    await blockAccountAction(null, formWith({ accountId: ACCOUNT_ID, adminId: "someone-else" }));

    expect(blockAccount).toHaveBeenCalledWith(prisma, { adminId: "admin-from-session", accountId: ACCOUNT_ID });
  });

  it("unblock: passes the session Admin and the account", async () => {
    vi.mocked(unblockAccount).mockResolvedValue({ ok: true, changed: false });

    const result = await unblockAccountAction(null, formWith({ accountId: ACCOUNT_ID }));

    expect(result).toEqual({ ok: true, changed: false });
    expect(unblockAccount).toHaveBeenCalledWith(prisma, { adminId: "admin-from-session", accountId: ACCOUNT_ID });
  });

  it("nick: passes the session Admin, the account and the new nick", async () => {
    vi.mocked(updateAccountNick).mockResolvedValue({ ok: true, changed: true });

    const result = await updateAccountNickAction(null, formWith({ accountId: ACCOUNT_ID, nick: "Corredora" }));

    expect(result).toEqual({ ok: true, changed: true });
    expect(updateAccountNick).toHaveBeenCalledWith(prisma, {
      adminId: "admin-from-session",
      accountId: ACCOUNT_ID,
      nick: "Corredora",
    });
  });

  it("a missing field reaches the service as an empty text, which it rejects", async () => {
    vi.mocked(updateAccountNick).mockResolvedValue({ ok: false, reason: "not-found" });

    await updateAccountNickAction(null, new FormData());

    expect(updateAccountNick).toHaveBeenCalledWith(prisma, { adminId: "admin-from-session", accountId: "", nick: "" });
  });

  it.each([
    ["block", () => blockAccountAction(null, formWith({ accountId: ACCOUNT_ID })), blockAccount],
    ["unblock", () => unblockAccountAction(null, formWith({ accountId: ACCOUNT_ID })), unblockAccount],
    ["nick", () => updateAccountNickAction(null, formWith({ accountId: ACCOUNT_ID, nick: "X1" })), updateAccountNick],
  ] as const)("%s: someone who is not an Admin stops at requireAdmin and changes nothing", async (_, action, service) => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenSignal());

    await expect(action()).rejects.toBeInstanceOf(ForbiddenSignal);

    expect(service).not.toHaveBeenCalled();
  });
});
