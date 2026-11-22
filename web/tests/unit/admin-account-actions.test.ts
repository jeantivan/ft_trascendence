import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockAccountAction, deleteAccountAction, unblockAccountAction, updateAccountNickAction } from "@/lib/admin/actions";
import { blockAccount, deleteAccount, unblockAccount, updateAccountNick } from "@/lib/admin/accounts";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

vi.mock("@/lib/permissions/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin/accounts", () => ({
  blockAccount: vi.fn(),
  deleteAccount: vi.fn(),
  unblockAccount: vi.fn(),
  updateAccountNick: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

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

  // The account page no longer exists: back to the list, which says it was deleted
  it("delete: deletes with the session Admin, redraws the panel and goes back to the list with a notice", async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ ok: true, changed: true });

    await deleteAccountAction(null, formWith({ accountId: ACCOUNT_ID, adminId: "someone-else" }));

    expect(deleteAccount).toHaveBeenCalledWith(prisma, { adminId: "admin-from-session", accountId: ACCOUNT_ID });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/accounts", "layout");
    expect(redirect).toHaveBeenCalledWith("/admin/accounts?deleted=1");
  });

  // Refused: stay on the account page with the reason. Same redraw rule as blocking:
  // last-admin means the page is old; not-found would turn the page into a 404 and lose the message
  it.each([
    ["self", false],
    ["not-found", false],
    ["last-admin", true],
  ] as const)("delete refused (%s) gives the reason, stays on the page, redraws: %s", async (reason, redraws) => {
    vi.mocked(deleteAccount).mockResolvedValue({ ok: false, reason });

    const result = await deleteAccountAction(null, formWith({ accountId: ACCOUNT_ID }));

    expect(result).toEqual({ ok: false, reason });
    expect(redirect).not.toHaveBeenCalled();
    expect(vi.mocked(revalidatePath).mock.calls.length > 0).toBe(redraws);
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
    ["delete", () => deleteAccountAction(null, formWith({ accountId: ACCOUNT_ID })), deleteAccount],
  ] as const)("%s: someone who is not an Admin stops at requireAdmin and changes nothing", async (_, action, service) => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenSignal());

    await expect(action()).rejects.toBeInstanceOf(ForbiddenSignal);

    expect(service).not.toHaveBeenCalled();
  });

  // The panel pages read the database: after a change they must be drawn again
  it.each([
    ["block", blockAccountAction, blockAccount],
    ["unblock", unblockAccountAction, unblockAccount],
    ["nick", updateAccountNickAction, updateAccountNick],
  ] as const)("%s: a change redraws the panel pages", async (_name, action, service) => {
    vi.mocked(service).mockResolvedValue({ ok: true, changed: true });

    await action(null, formWith({ accountId: ACCOUNT_ID, nick: "Nuevo" }));

    expect(revalidatePath).toHaveBeenCalledWith("/admin/accounts", "layout");
  });

  // changed: false means another Admin got there first: what the page shows is old
  it.each([
    ["block", blockAccountAction, blockAccount],
    ["unblock", unblockAccountAction, unblockAccount],
    ["nick", updateAccountNickAction, updateAccountNick],
  ] as const)("%s: already like that (another Admin was first) also redraws the panel", async (_name, action, service) => {
    vi.mocked(service).mockResolvedValue({ ok: true, changed: false });

    await action(null, formWith({ accountId: ACCOUNT_ID, nick: "Nuevo" }));

    expect(revalidatePath).toHaveBeenCalledWith("/admin/accounts", "layout");
  });

  // Refused for being the last unblocked Admin: another Admin was blocked after the
  // page was drawn, so the panel shows an old state
  it("block refused because the account is the last unblocked Admin redraws the panel", async () => {
    vi.mocked(blockAccount).mockResolvedValue({ ok: false, reason: "last-admin" });

    await blockAccountAction(null, formWith({ accountId: ACCOUNT_ID }));

    expect(revalidatePath).toHaveBeenCalledWith("/admin/accounts", "layout");
  });

  // The other refusals change nothing. not-found does not redraw either: the account
  // page would turn into a 404 and the message "Esta cuenta ya no existe." would be lost
  it.each([
    ["block", blockAccountAction, blockAccount, "self"],
    ["block", blockAccountAction, blockAccount, "not-found"],
    ["unblock", unblockAccountAction, unblockAccount, "not-found"],
  ] as const)("%s refused (%s): nothing to redraw", async (_name, action, service, reason) => {
    vi.mocked(service).mockResolvedValue({ ok: false, reason });

    await action(null, formWith({ accountId: ACCOUNT_ID }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("nick refused because it breaks the sign-up rule: nothing to redraw", async () => {
    vi.mocked(updateAccountNick).mockResolvedValue({ ok: false, reason: "invalid-nick", message: "x" });

    await updateAccountNickAction(null, formWith({ accountId: ACCOUNT_ID, nick: "A" }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
