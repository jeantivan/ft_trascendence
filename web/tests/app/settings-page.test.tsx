import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/permissions/require-auth", () => ({
  requireAuth: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/user/user-settings-service", () => ({
  userSettingsService: {
    getProfile: vi.fn(async () => ({
      id: "user-1",
      email: "marcos@retirovolt.es",
      nick: "marcos.soler",
      image: null,
      hasPassword: true,
      statsPublic: false,
      showOnline: true,
      notificationsEnabled: true,
      healthConsentAt: null,
      healthConsentVersion: null,
    })),
  },
}));
vi.mock("@/lib/user/actions", () => ({
  isRecentAuth: vi.fn(async () => true),
  reauthenticateAction: vi.fn(),
  updateNickAction: vi.fn(),
  updateEmailAction: vi.fn(),
  updatePasswordAction: vi.fn(),
  updatePrivacyAction: vi.fn(),
  giveHealthConsentAction: vi.fn(),
  withdrawHealthConsentAction: vi.fn(),
  purgeHealthDataAction: vi.fn(),
}));
vi.mock("@/lib/gdpr/actions", () => ({
  requestDeleteCodeAction: vi.fn(),
  deleteAccountAction: vi.fn(async () => ({ success: true })),
}));

import SettingsPage from "@/app/(app)/settings/page";

describe("/settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("abre la pestaña Privacidad cuando la URL trae ?tab=privacidad", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "privacidad" }) }));

    expect(screen.getByRole("heading", { name: "Visibilidad y Notificaciones" })).toBeInTheDocument();
  });

  it("abre Perfil por defecto cuando falta tab o llega como array", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: ["privacidad", "perfil"] }) }));

    expect(screen.getByRole("heading", { name: "Avatar" })).toBeInTheDocument();
  });
});
