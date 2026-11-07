import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAccountSection } from "@/components/gdpr/DeleteAccountSection";
import { deleteAccountAction, requestDeleteCodeAction } from "@/lib/gdpr/actions";

vi.mock("@/lib/gdpr/actions", () => ({
  deleteAccountAction: vi.fn(),
  requestDeleteCodeAction: vi.fn(),
}));

const requestButton = () => screen.getByRole("button", { name: /Enviar código|Reenviar en|Enviando/ });
const deleteButton = () => screen.getByRole("button", { name: /Borrar mi cuenta|Borrando/ });
const codeInput = () => screen.getByLabelText("Código de confirmación") as HTMLInputElement;

async function clickRequest() {
  await act(async () => {
    fireEvent.click(requestButton());
  });
}

function typeCode(value: string) {
  fireEvent.change(codeInput(), { target: { value } });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DeleteAccountSection", () => {
  it("starts with the notice, an enabled empty code field and the confirm button disabled", () => {
    render(<DeleteAccountSection />);

    expect(screen.getByText(/Borrar tu cuenta es una acción definitiva/)).toBeInTheDocument();
    expect(requestButton()).toBeEnabled();
    expect(codeInput()).toBeEnabled();
    expect(codeInput().value).toBe("");
    expect(deleteButton()).toBeDisabled();
  });

  it("requests the code, tells the user and starts the cooldown", async () => {
    vi.mocked(requestDeleteCodeAction).mockResolvedValue({ success: true });
    render(<DeleteAccountSection />);

    await clickRequest();

    expect(requestDeleteCodeAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Te hemos enviado un código a tu correo");
    expect(requestButton()).toHaveTextContent("Reenviar en 60 s");
    expect(requestButton()).toBeDisabled();
  });

  it("does not show or prefill any code received from the server", async () => {
    vi.mocked(requestDeleteCodeAction).mockResolvedValue({ success: true, code: "123456" } as never);
    render(<DeleteAccountSection />);

    await clickRequest();

    expect(document.body).not.toHaveTextContent("123456");
    expect(codeInput().value).toBe("");
  });

  it("counts down and enables the button again when the cooldown ends", async () => {
    vi.useFakeTimers();
    vi.mocked(requestDeleteCodeAction).mockResolvedValue({ success: true });
    render(<DeleteAccountSection />);
    await clickRequest();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(requestButton()).toHaveTextContent("Reenviar en 59 s");

    // One second at a time: each tick schedules the next one after React re-renders
    for (let second = 0; second < 59; second++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(requestButton()).toHaveTextContent("Enviar código");
    expect(requestButton()).toBeEnabled();
  });

  it("uses the wait the server returns when it refuses to send another code", async () => {
    vi.mocked(requestDeleteCodeAction).mockResolvedValue({
      success: false,
      error: "Ya se envió un código hace poco. Espera antes de pedir otro.",
      retryAfterSeconds: 42,
    });
    render(<DeleteAccountSection />);

    await clickRequest();

    expect(screen.getByRole("alert")).toHaveTextContent("Ya se envió un código hace poco");
    expect(requestButton()).toHaveTextContent("Reenviar en 42 s");
  });

  it("shows the wait of a minute after a failed send", async () => {
    vi.mocked(requestDeleteCodeAction).mockResolvedValue({
      success: false,
      error: "No se pudo enviar el código. Espera un minuto antes de reintentarlo.",
      retryAfterSeconds: 60,
    });
    render(<DeleteAccountSection />);

    await clickRequest();

    expect(screen.getByRole("alert")).toHaveTextContent("Espera un minuto");
    expect(requestButton()).toHaveTextContent("Reenviar en 60 s");
    expect(requestButton()).toBeDisabled();
  });

  it("lets the user retry at once when nothing was issued, e.g. wrong mail settings", async () => {
    vi.mocked(requestDeleteCodeAction).mockResolvedValue({
      success: false,
      error: "No se pudo enviar el código. Inténtalo más tarde.",
    });
    render(<DeleteAccountSection />);

    await clickRequest();

    expect(screen.getByRole("alert")).toHaveTextContent("Inténtalo más tarde");
    expect(requestButton()).toBeEnabled();
  });

  it("keeps the confirm button disabled until the code has six digits and drops non-digits", () => {
    render(<DeleteAccountSection />);

    typeCode("12a34");
    expect(codeInput().value).toBe("1234");
    expect(deleteButton()).toBeDisabled();

    typeCode("123456789");
    expect(codeInput().value).toBe("123456");
    expect(deleteButton()).toBeEnabled();
  });

  it("sends the typed code to the delete action and shows its error without repeating the code", async () => {
    vi.mocked(deleteAccountAction).mockResolvedValue({ success: false, error: "Código no válido o caducado" });
    render(<DeleteAccountSection />);
    typeCode("654321");

    await act(async () => {
      fireEvent.click(deleteButton());
    });

    expect(deleteAccountAction).toHaveBeenCalledTimes(1);
    const formData = vi.mocked(deleteAccountAction).mock.calls[0][1];
    expect(formData.get("code")).toBe("654321");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Código no válido o caducado");
    expect(alert).not.toHaveTextContent("654321");
  });

  it("blocks the request button and the field while the account is being deleted", async () => {
    vi.mocked(deleteAccountAction).mockReturnValue(new Promise(() => {}));
    render(<DeleteAccountSection />);
    typeCode("654321");

    await act(async () => {
      fireEvent.click(deleteButton());
    });

    expect(deleteButton()).toHaveTextContent("Borrando…");
    expect(deleteButton()).toBeDisabled();
    expect(requestButton()).toBeDisabled();
    expect(codeInput()).toBeDisabled();
  });

  it("blocks the confirm button while another code is being requested", async () => {
    vi.mocked(requestDeleteCodeAction).mockReturnValue(new Promise(() => {}));
    render(<DeleteAccountSection />);
    typeCode("654321");

    await clickRequest();

    expect(requestButton()).toHaveTextContent("Enviando…");
    expect(requestButton()).toBeDisabled();
    expect(deleteButton()).toBeDisabled();
  });
});
