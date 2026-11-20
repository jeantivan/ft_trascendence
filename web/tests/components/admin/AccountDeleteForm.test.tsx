import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDeleteForm } from "@/components/admin/AccountDeleteForm";
import { deleteAccountAction } from "@/lib/admin/actions";

vi.mock("@/lib/admin/actions", () => ({ deleteAccountAction: vi.fn() }));

const ID = "11111111-1111-4111-8111-111111111111";

beforeAll(() => {
  // jsdom does not implement showModal() or close() on <dialog> (as in Modal.test.tsx)
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  vi.resetAllMocks();
});

async function click(name: string | RegExp, scope: Pick<typeof screen, "getByRole"> = screen) {
  await act(async () => {
    fireEvent.click(scope.getByRole("button", { name }));
  });
}

describe("AccountDeleteForm", () => {
  it("cancelling the question deletes nothing", async () => {
    render(<AccountDeleteForm accountId={ID} />);

    await click("Borrar cuenta");
    await click("Cancelar");

    expect(deleteAccountAction).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, reason: "self" } as const, "No puedes borrar tu propia cuenta."],
    [{ ok: false, reason: "not-found" } as const, "Esta cuenta ya no existe."],
    [{ ok: false, reason: "last-admin" } as const, "No se puede borrar al último administrador sin bloquear."],
  ])("confirming sends the account, and a refused deletion says why (%j)", async (result, message) => {
    vi.mocked(deleteAccountAction).mockResolvedValue(result);
    render(<AccountDeleteForm accountId={ID} />);

    await click("Borrar cuenta");
    await click("Borrar", within(screen.getByRole("dialog", { name: "¿Borrar esta cuenta?" })));

    const form = vi.mocked(deleteAccountAction).mock.calls[0][1] as FormData;
    expect(form.get("accountId")).toBe(ID);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });
});
