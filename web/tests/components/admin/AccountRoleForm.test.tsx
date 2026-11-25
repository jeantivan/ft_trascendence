import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountRoleForm } from "@/components/admin/AccountRoleForm";
import { makeAdminAction, removeAdminAction } from "@/lib/admin/actions";

vi.mock("@/lib/admin/actions", () => ({ makeAdminAction: vi.fn(), removeAdminAction: vi.fn() }));

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

async function confirmMakeAdmin() {
  await click("Hacer administrador");
  await click("Dar el rol", within(screen.getByRole("dialog", { name: "¿Dar el rol de administrador a esta cuenta?" })));
}

async function confirmRemoveAdmin() {
  await click("Quitar el rol de administrador");
  await click("Quitar el rol", within(screen.getByRole("dialog", { name: "¿Quitar el rol de administrador a esta cuenta?" })));
}

describe("AccountRoleForm", () => {
  it("making a normal account an Admin asks first, then sends the account and says it is done", async () => {
    vi.mocked(makeAdminAction).mockResolvedValue({ ok: true, changed: true });
    render(<AccountRoleForm accountId={ID} roleGlobal="user" />);

    await confirmMakeAdmin();

    const form = vi.mocked(makeAdminAction).mock.calls[0][1] as FormData;
    expect(form.get("accountId")).toBe(ID);
    expect([...form.keys()]).toEqual(["accountId"]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ahora es administrador: verá el panel de administración en su siguiente petición.",
    );
  });

  it("removing the Admin role from an Admin asks first, then says it is done", async () => {
    vi.mocked(removeAdminAction).mockResolvedValue({ ok: true, changed: true });
    render(<AccountRoleForm accountId={ID} roleGlobal="admin" />);

    await confirmRemoveAdmin();

    expect(removeAdminAction).toHaveBeenCalledOnce();
    expect(makeAdminAction).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ya no es administrador: dejará de ver el panel de administración en su siguiente petición.",
    );
  });

  it("cancelling the question changes nothing", async () => {
    render(<AccountRoleForm accountId={ID} roleGlobal="user" />);

    await click("Hacer administrador");
    await click("Cancelar");

    expect(makeAdminAction).not.toHaveBeenCalled();
  });

  // Another Admin got there first: say so, it is already as wanted
  it.each([
    ["user", confirmMakeAdmin, makeAdminAction, "Ya era administrador: otro administrador se lo dio antes."],
    ["admin", confirmRemoveAdmin, removeAdminAction, "Ya no es administrador: otro administrador se lo quitó antes."],
  ] as const)("already like that (%s) says so", async (roleGlobal, confirm, action, message) => {
    vi.mocked(action).mockResolvedValue({ ok: true, changed: false });
    render(<AccountRoleForm accountId={ID} roleGlobal={roleGlobal} />);

    await confirm();

    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it.each([
    [{ ok: false, reason: "self" } as const, "No puedes quitar el rol de administrador a tu propia cuenta."],
    [{ ok: false, reason: "not-found" } as const, "Esta cuenta ya no existe."],
    [{ ok: false, reason: "last-admin" } as const, "No se puede quitar el rol de administrador al último administrador sin bloquear."],
  ])("a refused removal says why (%j)", async (result, message) => {
    vi.mocked(removeAdminAction).mockResolvedValue(result);
    render(<AccountRoleForm accountId={ID} roleGlobal="admin" />);

    await confirmRemoveAdmin();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("making a Manager of a club an Admin is refused with what to do first", async () => {
    vi.mocked(makeAdminAction).mockResolvedValue({ ok: false, reason: "club-manager" });
    render(<AccountRoleForm accountId={ID} roleGlobal="user" />);

    await confirmMakeAdmin();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Es Manager de un club: quítale antes el rol de Manager.",
    );
  });

  it("while the action is on its way, its button is disabled and no old message is shown", async () => {
    let finish!: (result: { ok: true; changed: boolean }) => void;
    vi.mocked(makeAdminAction).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<AccountRoleForm accountId={ID} roleGlobal="user" />);

    await confirmMakeAdmin();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dando el rol..." })).toBeDisabled();
    await act(async () => finish({ ok: true, changed: true }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Ahora es administrador: verá el panel de administración en su siguiente petición.",
    );
  });

  it("while the removal is on its way, its button says so and is disabled", async () => {
    let finish!: (result: { ok: true; changed: boolean }) => void;
    vi.mocked(removeAdminAction).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<AccountRoleForm accountId={ID} roleGlobal="admin" />);

    await confirmRemoveAdmin();

    expect(screen.getByRole("button", { name: "Quitando el rol..." })).toBeDisabled();
    // Finish it: React waits for every pending action before ending the next one
    await act(async () => finish({ ok: true, changed: true }));
  });

  // Only with a request sent by hand (the own account page has no role button): still a message
  it("making your own account an Admin is refused with a message", async () => {
    vi.mocked(makeAdminAction).mockResolvedValue({ ok: false, reason: "self" });
    render(<AccountRoleForm accountId={ID} roleGlobal="user" />);

    await confirmMakeAdmin();

    expect(screen.getByRole("alert")).toHaveTextContent("No puedes cambiar el rol de tu propia cuenta.");
  });
});
