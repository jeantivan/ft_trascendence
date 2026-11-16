import { beforeEach, describe, expect, it, vi } from "vitest";
import { signOut } from "@/auth";
import { deleteAccountAction } from "@/lib/gdpr/actions";
import { deleteAccountWithOtp } from "@/lib/gdpr/delete-account";
import { requireAuth } from "@/lib/permissions/require-auth";

vi.mock("@/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/permissions/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/gdpr/delete-account", () => ({ deleteAccountWithOtp: vi.fn() }));

// next/navigation's redirect() and Auth.js' signOut() end by throwing
class RedirectSignal extends Error {}

const SESSION_USER = { id: "user-from-session", email: "a@b.c", nick: "Uno", roleGlobal: "user" as const };

function formWith(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  return form;
}

describe("deleteAccountAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(SESSION_USER);
  });

  it("deletes with the session user, then signs out, and propagates the redirect", async () => {
    vi.mocked(deleteAccountWithOtp).mockResolvedValue({ deleted: true });
    vi.mocked(signOut).mockRejectedValue(new RedirectSignal());

    await expect(deleteAccountAction(null, formWith({ code: "123456" }))).rejects.toBeInstanceOf(RedirectSignal);

    expect(deleteAccountWithOtp).toHaveBeenCalledWith("user-from-session", "123456");
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/account-deleted" });
    // The deletion is confirmed before the session is closed
    const deleteOrder = vi.mocked(deleteAccountWithOtp).mock.invocationCallOrder[0];
    const signOutOrder = vi.mocked(signOut).mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(signOutOrder);
  });

  it("still signs out when the account is deleted but some avatar files were not removed", async () => {
    vi.mocked(deleteAccountWithOtp).mockResolvedValue({ deleted: true, avatarCleanupFailed: 1 });
    vi.mocked(signOut).mockRejectedValue(new RedirectSignal());

    await expect(deleteAccountAction(null, formWith({ code: "123456" }))).rejects.toBeInstanceOf(RedirectSignal);

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/account-deleted" });
  });

  it("returns a controlled error and keeps the session when the code is rejected", async () => {
    vi.mocked(deleteAccountWithOtp).mockResolvedValue({ deleted: false, reason: "invalid_code" });

    const result = await deleteAccountAction(null, formWith({ code: "000000" }));

    expect(result).toEqual({ success: false, error: "Código no válido o caducado" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("returns a controlled error and keeps the session when the user is the last Admin", async () => {
    vi.mocked(deleteAccountWithOtp).mockResolvedValue({ deleted: false, reason: "last_admin" });

    const result = await deleteAccountAction(null, formWith({ code: "123456" }));

    expect(result).toEqual({
      success: false,
      error: "Eres el último Admin: nombra a otra persona Admin antes de borrar tu cuenta.",
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["empty", { code: "" }],
  ])("rejects a %s code without deleting or signing out", async (_label, fields) => {
    const result = await deleteAccountAction(null, formWith(fields));

    expect(result).toEqual({ success: false, error: "Código no válido o caducado" });
    expect(deleteAccountWithOtp).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects a file in the code field without deleting or signing out", async () => {
    const form = new FormData();
    form.append("code", new File(["123456"], "code.txt"));

    const result = await deleteAccountAction(null, form);

    expect(result).toEqual({ success: false, error: "Código no válido o caducado" });
    expect(deleteAccountWithOtp).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("stops before deleting when requireAuth redirects (no session, deleted or blocked user)", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new RedirectSignal());

    await expect(deleteAccountAction(null, formWith({ code: "123456" }))).rejects.toBeInstanceOf(RedirectSignal);

    expect(deleteAccountWithOtp).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ignores a userId sent in the form: it deletes the session user", async () => {
    vi.mocked(deleteAccountWithOtp).mockResolvedValue({ deleted: false, reason: "invalid_code" });

    await deleteAccountAction(null, formWith({ code: "123456", userId: "someone-else" }));

    expect(deleteAccountWithOtp).toHaveBeenCalledTimes(1);
    expect(deleteAccountWithOtp).toHaveBeenCalledWith("user-from-session", "123456");
  });

  it("does not sign out nor report success when the deletion throws", async () => {
    vi.mocked(deleteAccountWithOtp).mockRejectedValue(new Error("database down"));

    await expect(deleteAccountAction(null, formWith({ code: "123456" }))).rejects.toThrow("database down");

    expect(signOut).not.toHaveBeenCalled();
  });
});
