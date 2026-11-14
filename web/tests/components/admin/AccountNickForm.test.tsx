import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountNickForm } from "@/components/admin/AccountNickForm";
import { updateAccountNickAction } from "@/lib/admin/actions";

vi.mock("@/lib/admin/actions", () => ({ updateAccountNickAction: vi.fn() }));

const ID = "11111111-1111-4111-8111-111111111111";
const nickInput = () => screen.getByLabelText("Nick") as HTMLInputElement;

async function save(nick: string) {
  fireEvent.change(nickInput(), { target: { value: nick } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar nick" }));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AccountNickForm", () => {
  it("starts with the current nick", () => {
    render(<AccountNickForm accountId={ID} nick="Ana" />);

    expect(nickInput().value).toBe("Ana");
  });

  it("sends the account and the new nick, and says it is done", async () => {
    vi.mocked(updateAccountNickAction).mockResolvedValue({ ok: true, changed: true });
    render(<AccountNickForm accountId={ID} nick="Ana" />);

    await save("Anita");

    const form = vi.mocked(updateAccountNickAction).mock.calls[0][1] as FormData;
    expect(form.get("accountId")).toBe(ID);
    expect(form.get("nick")).toBe("Anita");
    expect(screen.getByRole("status")).toHaveTextContent("Nick cambiado.");
  });

  it("a nick that breaks the sign-up rule shows the reason on the field", async () => {
    vi.mocked(updateAccountNickAction).mockResolvedValue({
      ok: false,
      reason: "invalid-nick",
      message: "El nick debe tener al menos 2 caracteres",
    });
    render(<AccountNickForm accountId={ID} nick="Ana" />);

    await save("A");

    expect(screen.getByRole("alert")).toHaveTextContent("El nick debe tener al menos 2 caracteres");
    expect(nickInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("the same nick as before changes nothing, and says so", async () => {
    vi.mocked(updateAccountNickAction).mockResolvedValue({ ok: true, changed: false });
    render(<AccountNickForm accountId={ID} nick="Ana" />);

    await save("Ana");

    expect(screen.getByRole("status")).toHaveTextContent("Ese ya era su nick.");
  });
});
