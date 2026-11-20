import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountBlockForm } from "@/components/admin/AccountBlockForm";
import { blockAccountAction, unblockAccountAction } from "@/lib/admin/actions";

vi.mock("@/lib/admin/actions", () => ({ blockAccountAction: vi.fn(), unblockAccountAction: vi.fn() }));

const ID = "11111111-1111-4111-8111-111111111111";
const BLOCKED_AT = new Date("2026-11-16T10:00:00Z");

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

async function confirmBlock() {
  await click("Bloquear cuenta");
  await click("Bloquear", within(screen.getByRole("dialog", { name: "¿Bloquear esta cuenta?" })));
}

describe("AccountBlockForm", () => {
  it("blocking asks first, then sends the account and says it is done", async () => {
    vi.mocked(blockAccountAction).mockResolvedValue({ ok: true, changed: true });
    render(<AccountBlockForm accountId={ID} blockedAt={null} />);

    await confirmBlock();

    const form = vi.mocked(blockAccountAction).mock.calls[0][1] as FormData;
    expect(form.get("accountId")).toBe(ID);
    expect(screen.getByRole("status")).toHaveTextContent("Cuenta bloqueada");
  });

  it("cancelling the question blocks nothing", async () => {
    render(<AccountBlockForm accountId={ID} blockedAt={null} />);

    await click("Bloquear cuenta");
    await click("Cancelar");

    expect(blockAccountAction).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, reason: "self" } as const, "No puedes bloquear tu propia cuenta."],
    [{ ok: false, reason: "not-found" } as const, "Esta cuenta ya no existe."],
    [{ ok: false, reason: "last-admin" } as const, "No se puede bloquear al último administrador sin bloquear."],
  ])("a refused block says why (%j)", async (result, message) => {
    vi.mocked(blockAccountAction).mockResolvedValue(result);
    render(<AccountBlockForm accountId={ID} blockedAt={null} />);

    await confirmBlock();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("a blocked account offers to unblock it, without asking", async () => {
    vi.mocked(unblockAccountAction).mockResolvedValue({ ok: true, changed: true });
    render(<AccountBlockForm accountId={ID} blockedAt={BLOCKED_AT} />);

    await click("Desbloquear cuenta");

    expect(unblockAccountAction).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Cuenta desbloqueada");
  });

  it("after blocking and then unblocking, the message is about the last one", async () => {
    vi.mocked(blockAccountAction).mockResolvedValue({ ok: true, changed: true });
    vi.mocked(unblockAccountAction).mockResolvedValue({ ok: true, changed: true });
    const { rerender } = render(<AccountBlockForm accountId={ID} blockedAt={null} />);

    await confirmBlock();
    // The page is drawn again with the account now blocked (revalidatePath)
    rerender(<AccountBlockForm accountId={ID} blockedAt={BLOCKED_AT} />);
    await click("Desbloquear cuenta");

    expect(screen.getByRole("status")).toHaveTextContent("Cuenta desbloqueada");
  });

  // Each button keeps the result of its last use: pressing it again must not show that
  // old result while the new one is on its way
  it("block, unblock, block again: while the second block is pending, the first one's message is not shown", async () => {
    vi.mocked(blockAccountAction).mockResolvedValueOnce({ ok: true, changed: true });
    vi.mocked(unblockAccountAction).mockResolvedValue({ ok: true, changed: true });
    const { rerender } = render(<AccountBlockForm accountId={ID} blockedAt={null} />);
    await confirmBlock();
    rerender(<AccountBlockForm accountId={ID} blockedAt={BLOCKED_AT} />);
    await click("Desbloquear cuenta");
    rerender(<AccountBlockForm accountId={ID} blockedAt={null} />);

    let finish!: (result: { ok: true; changed: boolean }) => void;
    vi.mocked(blockAccountAction).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await confirmBlock();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bloqueando..." })).toBeDisabled();

    await act(async () => finish({ ok: true, changed: false }));
    expect(screen.getByRole("status")).toHaveTextContent("La cuenta ya estaba bloqueada.");
  });

  it("unblock, block, unblock again: while the second unblock is pending, the first one's message is not shown", async () => {
    vi.mocked(unblockAccountAction).mockResolvedValueOnce({ ok: true, changed: true });
    vi.mocked(blockAccountAction).mockResolvedValue({ ok: true, changed: true });
    const { rerender } = render(<AccountBlockForm accountId={ID} blockedAt={BLOCKED_AT} />);
    await click("Desbloquear cuenta");
    rerender(<AccountBlockForm accountId={ID} blockedAt={null} />);
    await confirmBlock();
    rerender(<AccountBlockForm accountId={ID} blockedAt={BLOCKED_AT} />);

    let finish!: (result: { ok: true; changed: boolean }) => void;
    vi.mocked(unblockAccountAction).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await click("Desbloquear cuenta");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await act(async () => finish({ ok: true, changed: true }));
    expect(screen.getByRole("status")).toHaveTextContent("Cuenta desbloqueada");
  });

  // Unblocking does not ask first: the line next to the button says what is about to change
  it("a blocked account says since when, next to the unblock button", () => {
    render(<AccountBlockForm accountId={ID} blockedAt={BLOCKED_AT} />);

    expect(screen.getByText("Cuenta bloqueada desde el 16/11/2026.")).toBeInTheDocument();
  });

  it("an active account does not say it is blocked", () => {
    render(<AccountBlockForm accountId={ID} blockedAt={null} />);

    expect(screen.queryByText(/Cuenta bloqueada desde/)).not.toBeInTheDocument();
  });

  it("if another Admin already did it, says so", async () => {
    vi.mocked(unblockAccountAction).mockResolvedValue({ ok: true, changed: false });
    render(<AccountBlockForm accountId={ID} blockedAt={BLOCKED_AT} />);

    await click("Desbloquear cuenta");

    expect(screen.getByRole("status")).toHaveTextContent("La cuenta ya estaba desbloqueada.");
  });
});
