import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { MAX_IMAGE_BYTES } from "@/lib/uploads/check-image";
import type { SettingsProfile } from "@/lib/user/user-settings-service";

const {
  refreshMock,
  updateNickActionMock,
  updateEmailActionMock,
  updatePasswordActionMock,
  updatePrivacyActionMock,
  giveHealthConsentActionMock,
  withdrawHealthConsentActionMock,
  purgeHealthDataActionMock,
  reauthenticateActionMock,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  updateNickActionMock: vi.fn(),
  updateEmailActionMock: vi.fn(),
  updatePasswordActionMock: vi.fn(),
  updatePrivacyActionMock: vi.fn(),
  giveHealthConsentActionMock: vi.fn(),
  withdrawHealthConsentActionMock: vi.fn(),
  purgeHealthDataActionMock: vi.fn(),
  reauthenticateActionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/user/actions", () => ({
  reauthenticateAction: reauthenticateActionMock,
  updateNickAction: updateNickActionMock,
  updateEmailAction: updateEmailActionMock,
  updatePasswordAction: updatePasswordActionMock,
  updatePrivacyAction: updatePrivacyActionMock,
  giveHealthConsentAction: giveHealthConsentActionMock,
  withdrawHealthConsentAction: withdrawHealthConsentActionMock,
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
    window.history.replaceState(null, "", "/settings");
    updateNickActionMock.mockResolvedValue({
      success: true,
      message: "Nick actualizado correctamente",
    });
    updateEmailActionMock.mockResolvedValue({
      success: true,
      message: "Correo electrónico actualizado",
    });
    updatePasswordActionMock.mockResolvedValue({
      success: true,
      message: "Contraseña actualizada correctamente",
    });
    updatePrivacyActionMock.mockResolvedValue({
      success: true,
      message: "Preferencias de privacidad actualizadas",
    });
    giveHealthConsentActionMock.mockResolvedValue({
      success: true,
      message: "Consentimiento de datos de salud otorgado",
    });
    withdrawHealthConsentActionMock.mockResolvedValue({
      success: true,
      message: "Consentimiento de datos de salud retirado",
    });
    purgeHealthDataActionMock.mockResolvedValue({
      success: true,
      message: "Datos de salud históricos eliminados correctamente",
    });
    globalThis.URL.createObjectURL = vi.fn(() => "blob:preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("muestra vista previa antes de subir, permite cancelar o confirmar con progreso real y eliminar avatar", async () => {
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
    const firstFile = new File(["png"], "descartada.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [firstFile] } });

    expect(screen.getByText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText("descartada.png")).toBeInTheDocument();
    expect(instances).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("descartada.png")).not.toBeInTheDocument();

    const file = new File(["png"], "avatar.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(instances).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Subir imagen" }));

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

  it("envía formularios de nick, email y contraseña mostrando su estado de resultado", async () => {
    render(<SettingsTabs profile={BASE_PROFILE} recentAuth />);

    fireEvent.change(screen.getByLabelText("Nick de atleta"), {
      target: { value: "nuevo.nick" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nick" }));
    await waitFor(() => {
      expect(updateNickActionMock).toHaveBeenCalledOnce();
      expect(screen.getByText("Nick actualizado correctamente")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Nuevo correo electrónico"), {
      target: { value: "nuevo@retirovolt.es" },
    });
    fireEvent.change(screen.getAllByLabelText("Contraseña actual")[0], {
      target: { value: "Secret123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar email" }));
    await waitFor(() => {
      expect(updateEmailActionMock).toHaveBeenCalledOnce();
      expect(screen.getByText("Correo electrónico actualizado")).toBeInTheDocument();
    });

    fireEvent.change(screen.getAllByLabelText("Contraseña actual")[1], {
      target: { value: "Secret123!" },
    });
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "NewSecret123!" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: { value: "NewSecret123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    await waitFor(() => {
      expect(updatePasswordActionMock).toHaveBeenCalledOnce();
      expect(screen.getByText("Contraseña actualizada correctamente")).toBeInTheDocument();
    });
  });

  it("muestra botón de reautenticación por formulario en cuentas solo-OAuth sin sesión reciente", () => {
    render(
      <SettingsTabs
        profile={{ ...BASE_PROFILE, hasPassword: false }}
        recentAuth={false}
      />
    );

    expect(screen.getByText("Cuenta solo-OAuth")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Confirmar sesión reciente" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
  });

  it("permite alternar switches, gestionar consentimiento de salud y confirmar purga en el Modal", async () => {
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
    await act(async () => {
      fireEvent.click(statsSwitch);
    });

    await waitFor(() => {
      expect(updatePrivacyActionMock).toHaveBeenCalledWith({ statsPublic: true });
      expect(statsSwitch).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retirar consentimiento" }));
    });
    await waitFor(() => {
      expect(withdrawHealthConsentActionMock).toHaveBeenCalledOnce();
      expect(screen.getByText("Consentimiento de datos de salud retirado")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Borrar datos de salud" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Borrar datos de salud" }));
    expect(screen.getByText("¿Borrar todos tus datos de salud?")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, borrar datos de salud" }));
    });
    await waitFor(() => {
      expect(purgeHealthDataActionMock).toHaveBeenCalledOnce();
    });
  });

  it("rechaza en cliente imágenes mayores que MAX_IMAGE_BYTES y traduce errores 413/415 conservando la vista previa", async () => {
    const maxMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    const instances: MockXHR[] = [];

    class MockXHR {
      upload: { onprogress?: (e: ProgressEvent) => void } = {};
      onload?: () => void;
      onerror?: () => void;
      status = 413;
      responseText = "";
      open = vi.fn();
      send = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    vi.stubGlobal("XMLHttpRequest", MockXHR);

    render(<SettingsTabs profile={BASE_PROFILE} recentAuth />);

    const input = screen.getByLabelText("Seleccionar imagen de avatar");
    const oversized = new File(["x"], "enorme.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: MAX_IMAGE_BYTES + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });

    expect(screen.getByText(`La imagen supera el tamaño máximo de ${maxMb} MB`)).toBeInTheDocument();
    expect(screen.queryByText("Vista previa")).not.toBeInTheDocument();
    expect(instances).toHaveLength(0);

    const validFile = new File(["png"], "foto.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [validFile] } });
    expect(screen.getByText("Vista previa")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Subir imagen" }));
    instances[0].status = 413;
    instances[0].responseText = JSON.stringify({ error: "Image too large" });
    act(() => instances[0].onload?.());

    expect(screen.getByText("La imagen supera el máximo de 8000 px por lado")).toBeInTheDocument();
    expect(screen.getByText("Vista previa")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Subir imagen" }));
    instances[1].status = 413;
    instances[1].responseText = "<html><body>413 Request Entity Too Large</body></html>";
    act(() => instances[1].onload?.());

    expect(screen.getByText(`La imagen supera el tamaño máximo de ${maxMb} MB`)).toBeInTheDocument();
    expect(screen.getByText("Vista previa")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Subir imagen" }));
    instances[2].status = 415;
    instances[2].responseText = JSON.stringify({ error: "Unsupported image type" });
    act(() => instances[2].onload?.());

    expect(
      screen.getByText("Formato de imagen no válido o archivo dañado (usa JPG, PNG o WEBP)")
    ).toBeInTheDocument();
    expect(screen.getByText("Vista previa")).toBeInTheDocument();
  });

  it("sincroniza la URL con pushState, responde a popstate y permite navegar con flechas", () => {
    render(<SettingsTabs profile={BASE_PROFILE} recentAuth />);

    const perfilTab = screen.getByRole("tab", { name: "Perfil" });
    const privacidadTab = screen.getByRole("tab", { name: /privacidad/i });

    fireEvent.click(privacidadTab);
    expect(window.location.search).toBe("?tab=privacidad");
    expect(screen.getByRole("heading", { name: "Visibilidad y Notificaciones" })).toBeInTheDocument();

    window.history.replaceState(null, "", "/settings");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("heading", { name: "Avatar" })).toBeInTheDocument();

    perfilTab.focus();
    fireEvent.keyDown(perfilTab, { key: "ArrowRight" });
    expect(privacidadTab).toHaveFocus();
    expect(window.location.search).toBe("?tab=privacidad");

    fireEvent.keyDown(privacidadTab, { key: "ArrowLeft" });
    expect(perfilTab).toHaveFocus();
    expect(window.location.search).toBe("");
  });
});
