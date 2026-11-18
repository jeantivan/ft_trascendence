import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import type { SettingsProfile } from "@/lib/user/user-settings-service";

const {
  refreshMock,
  updatePrivacyActionMock,
  giveHealthConsentActionMock,
  purgeHealthDataActionMock,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  updatePrivacyActionMock: vi.fn(),
  giveHealthConsentActionMock: vi.fn(),
  purgeHealthDataActionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/user/actions", () => ({
  updateNickAction: vi.fn(async () => ({ success: true, message: "OK" })),
  updateEmailAction: vi.fn(async () => ({ success: true, message: "OK" })),
  updatePasswordAction: vi.fn(async () => ({ success: true, message: "OK" })),
  updatePrivacyAction: updatePrivacyActionMock,
  giveHealthConsentAction: giveHealthConsentActionMock,
  withdrawHealthConsentAction: vi.fn(async () => ({ success: true, message: "OK" })),
  purgeHealthDataAction: purgeHealthDataActionMock,
}));

vi.mock("@/lib/gdpr/actions", () => ({
  requestDeleteCodeAction: vi.fn(async () => ({ success: true })),
  deleteAccountAction: vi.fn(async () => ({ success: true })),
}));

const BASE_PROFILE: SettingsProfile = {
  id: "user-1",
  email: "marcos@retirovolt.es",
  nick: "marcos.soler",
  image: "/api/files/av-1",
  hasPassword: true,
  statsPublic: false,
  showOnline: true,
  notificationsEnabled: true,
  healthConsentAt: new Date("2026-11-10T10:00:00Z"),
  healthConsentVersion: 1,
};

describe("SettingsTabs (/settings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePrivacyActionMock.mockResolvedValue({
      success: true,
      message: "Preferencias de privacidad actualizadas",
    });
    giveHealthConsentActionMock.mockResolvedValue({
      success: true,
      message: "Consentimiento de datos de salud otorgado",
    });
    purgeHealthDataActionMock.mockResolvedValue({
      success: true,
      message: "Datos de salud históricos eliminados correctamente",
    });
    globalThis.URL.createObjectURL = vi.fn(() => "blob:preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it("permite cambiar entre las pestañas Perfil y Privacidad", () => {
    render(<SettingsTabs profile={BASE_PROFILE} recentAuth />);

    expect(screen.getByRole("heading", { name: "Avatar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Identidad en el club" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /privacidad/i }));

    expect(screen.getByRole("heading", { name: "Visibilidad y Notificaciones" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Datos de salud (RPE y Feedback)" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Borrar cuenta" })).toBeInTheDocument();
  });

  it("muestra vista previa y progreso real al subir avatar con XMLHttpRequest y permite eliminarlo", async () => {
    const instances: MockXHR[] = [];

    class MockXHR {
      upload: { onprogress?: (e: ProgressEvent) => void } = {};
      onload?: () => void;
      onerror?: () => void;
      status = 201;
      responseText = JSON.stringify({ id: "av-2", url: "/api/files/av-2" });
      open = vi.fn();
      send = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ removed: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsTabs profile={BASE_PROFILE} recentAuth />);

    const input = screen.getByLabelText("Seleccionar imagen de avatar");
    const file = new File(["png"], "avatar.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    const capturedXhr = instances[0];
    expect(capturedXhr).toBeDefined();
    capturedXhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 64,
      total: 100,
    } as ProgressEvent);

    await waitFor(() => {
      expect(screen.getByText("64%")).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
    });

    capturedXhr.onload?.();
    await waitFor(() => {
      expect(screen.getByText("Avatar actualizado correctamente")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar avatar" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/upload", { method: "DELETE" });
      expect(
        screen.getByText("Avatar eliminado; vuelto al avatar por defecto")
      ).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("muestra aviso de confirmación de sesión en cuentas solo-OAuth sin sesión reciente", () => {
    render(
      <SettingsTabs
        profile={{ ...BASE_PROFILE, hasPassword: false }}
        recentAuth={false}
      />
    );

    expect(screen.getByText("Cuenta solo-OAuth")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Confirmar sesión reciente" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=/settings"
    );
  });

  it("permite alternar switches de privacidad y confirmar el borrado de datos de salud en el Modal", async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });

    render(<SettingsTabs profile={BASE_PROFILE} recentAuth initialTab="privacidad" />);

    const statsSwitch = screen.getByRole("switch", {
      name: /estadísticas públicas en club profile/i,
    });
    expect(statsSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(statsSwitch);

    await waitFor(() => {
      expect(updatePrivacyActionMock).toHaveBeenCalledWith({ statsPublic: true });
    });

    fireEvent.click(screen.getByRole("button", { name: "Borrar datos de salud" }));
    expect(screen.getByText("¿Borrar todos tus datos de salud?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sí, borrar datos de salud" }));
    await waitFor(() => {
      expect(purgeHealthDataActionMock).toHaveBeenCalledOnce();
    });
  });
});
