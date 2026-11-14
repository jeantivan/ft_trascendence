import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAccountPage from "@/app/(app)/admin/accounts/[id]/page";
import { getAccountForAdmin } from "@/lib/admin/queries";

vi.mock("@/lib/admin/queries", () => ({ getAccountForAdmin: vi.fn() }));
vi.mock("@/lib/admin/actions", () => ({
  blockAccountAction: vi.fn(),
  unblockAccountAction: vi.fn(),
  updateAccountNickAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const ID = "11111111-1111-4111-8111-111111111111";
const params = (id: string) => Promise.resolve({ id });

describe("/admin/accounts/[id]", () => {
  beforeEach(() => {
    vi.mocked(getAccountForAdmin).mockReset();
  });

  it("reads the account the address names and shows it, with a way back to the list", async () => {
    vi.mocked(getAccountForAdmin).mockResolvedValue({
      id: ID,
      email: "ana@demo.local",
      nick: "Ana",
      roleGlobal: "user",
      blockedAt: null,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      clubs: [],
      isSelf: false,
    });

    render(await AdminAccountPage({ params: params(ID) }));

    expect(getAccountForAdmin).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("heading", { level: 2, name: "ana@demo.local" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a cuentas" })).toHaveAttribute("href", "/admin/accounts");
  });

  it("offers the Admin's actions: change the nick and block", async () => {
    vi.mocked(getAccountForAdmin).mockResolvedValue({
      id: ID,
      email: "ana@demo.local",
      nick: "Ana",
      roleGlobal: "user",
      blockedAt: null,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      clubs: [],
      isSelf: false,
    });

    render(await AdminAccountPage({ params: params(ID) }));

    expect(screen.getByLabelText("Nick")).toHaveValue("Ana");
    expect(screen.getByRole("button", { name: "Bloquear cuenta" })).toBeInTheDocument();
  });

  it("an account that does not exist (or a malformed id) is a 404", async () => {
    vi.mocked(getAccountForAdmin).mockResolvedValue(null);

    await expect(AdminAccountPage({ params: params("hola") })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("on the Admin's own account there is no block button, only why", async () => {
    vi.mocked(getAccountForAdmin).mockResolvedValue({
      id: ID,
      email: "admin@demo.local",
      nick: "Admin",
      roleGlobal: "admin",
      blockedAt: null,
      createdAt: new Date("2026-10-01T10:00:00Z"),
      clubs: [],
      isSelf: true,
    });

    render(await AdminAccountPage({ params: params(ID) }));

    expect(screen.queryByRole("button", { name: "Bloquear cuenta" })).not.toBeInTheDocument();
    expect(screen.getByText("Es tu cuenta: no puedes bloquear tu propia cuenta.")).toBeInTheDocument();
  });
});
