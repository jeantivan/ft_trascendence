import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthMock,
  authMock,
  signOutMock,
  revalidatePathMock,
  getProfileMock,
  updateNickMock,
  updateEmailMock,
  updatePasswordMock,
  updatePrivacyMock,
  giveHealthConsentMock,
  withdrawHealthConsentMock,
  purgeHealthDataMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  authMock: vi.fn(),
  signOutMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  getProfileMock: vi.fn(),
  updateNickMock: vi.fn(),
  updateEmailMock: vi.fn(),
  updatePasswordMock: vi.fn(),
  updatePrivacyMock: vi.fn(),
  giveHealthConsentMock: vi.fn(),
  withdrawHealthConsentMock: vi.fn(),
  purgeHealthDataMock: vi.fn(),
}));

vi.mock("@/lib/permissions/require-auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/auth", () => ({
  auth: authMock,
  signOut: signOutMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/user/user-settings-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/user/user-settings-service")>(
    "@/lib/user/user-settings-service"
  );
  return {
    ...actual,
    userSettingsService: {
      getProfile: getProfileMock,
      updateNick: updateNickMock,
      updateEmail: updateEmailMock,
      updatePassword: updatePasswordMock,
      updatePrivacy: updatePrivacyMock,
      giveHealthConsent: giveHealthConsentMock,
      withdrawHealthConsent: withdrawHealthConsentMock,
      purgeHealthData: purgeHealthDataMock,
    },
  };
});

import { UserAlreadyExistsError } from "@/lib/auth/user-repository";
import {
  giveHealthConsentAction,
  purgeHealthDataAction,
  reauthenticateAction,
  updateEmailAction,
  updateNickAction,
  updatePasswordAction,
  updatePrivacyAction,
  withdrawHealthConsentAction,
} from "@/lib/user/actions";
import {
  EmailChangeNotAllowedForOAuthError,
  InvalidCurrentPasswordError,
} from "@/lib/user/user-settings-service";

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("user settings server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ id: "user-1", email: "a@b.com", nick: "runner" });
    getProfileMock.mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      nick: "runner",
      image: null,
      hasPassword: true,
      statsPublic: false,
      showOnline: true,
      notificationsEnabled: true,
      healthConsentAt: null,
      healthConsentVersion: null,
    });
    authMock.mockResolvedValue({ authTime: Math.floor(Date.now() / 1000) });
  });

  it("updateNickAction actualiza el nick y revalida /settings", async () => {
    updateNickMock.mockResolvedValue({});
    const res = await updateNickAction(null, makeFormData({ nick: "nuevo_nick" }));
    expect(requireAuthMock).toHaveBeenCalledOnce();
    expect(updateNickMock).toHaveBeenCalledWith("user-1", { nick: "nuevo_nick" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/settings");
    expect(res).toEqual({ success: true, message: "Nick actualizado correctamente" });
  });

  it("updatePasswordAction rechaza si las contraseñas nuevas no coinciden", async () => {
    const res = await updatePasswordAction(
      null,
      makeFormData({
        currentPassword: "old",
        newPassword: "Password1!",
        confirmPassword: "OtherPassword1!",
      })
    );
    expect(res).toEqual({ success: false, error: "Las contraseñas nuevas no coinciden" });
    expect(updatePasswordMock).not.toHaveBeenCalled();
  });

  it("updatePasswordAction exige sesión reciente en cuentas solo-OAuth", async () => {
    getProfileMock.mockResolvedValueOnce({ hasPassword: false });
    authMock.mockResolvedValueOnce({ authTime: Math.floor(Date.now() / 1000) - 600 });

    const res = await updatePasswordAction(
      null,
      makeFormData({ newPassword: "Password1!", confirmPassword: "Password1!" })
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.requiresReauth).toBe(true);
    expect(updatePasswordMock).not.toHaveBeenCalled();
  });

  it("reauthenticateAction cierra sesión y redirige a /login con callbackUrl=/settings", async () => {
    await reauthenticateAction();
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/login?callbackUrl=/settings" });
  });

  it("updateEmailAction traduce InvalidCurrentPasswordError, EmailChangeNotAllowedForOAuthError y UserAlreadyExistsError", async () => {
    updateEmailMock.mockRejectedValueOnce(new InvalidCurrentPasswordError("Contraseña incorrecta"));
    expect(
      await updateEmailAction(null, makeFormData({ email: "nuevo@b.com", currentPassword: "wrong" }))
    ).toEqual({ success: false, error: "Contraseña incorrecta" });

    updateEmailMock.mockRejectedValueOnce(new EmailChangeNotAllowedForOAuthError());
    expect(await updateEmailAction(null, makeFormData({ email: "nuevo@b.com" }))).toEqual({
      success: false,
      error: "Las cuentas sin contraseña no pueden cambiar el correo directamente",
    });

    updateEmailMock.mockRejectedValueOnce(new UserAlreadyExistsError());
    expect(
      await updateEmailAction(null, makeFormData({ email: "duplicado@b.com", currentPassword: "ok" }))
    ).toEqual({
      success: false,
      error: "Ese correo electrónico ya está registrado",
    });
  });

  it("updatePrivacyAction, consentimiento y purga llaman al servicio y revalidan", async () => {
    updatePrivacyMock.mockResolvedValue({});
    giveHealthConsentMock.mockResolvedValue({});
    withdrawHealthConsentMock.mockResolvedValue({});
    purgeHealthDataMock.mockResolvedValue(undefined);

    expect((await updatePrivacyAction({ statsPublic: true })).success).toBe(true);
    expect((await giveHealthConsentAction()).success).toBe(true);
    expect((await withdrawHealthConsentAction()).success).toBe(true);
    expect((await purgeHealthDataAction()).success).toBe(true);

    expect(purgeHealthDataMock).toHaveBeenCalledWith("user-1", { confirm: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(4);
  });
});
