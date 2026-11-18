import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAccountsPage from "@/app/(app)/admin/accounts/page";
import { getAccountsPageForAdmin } from "@/lib/admin/queries";

vi.mock("@/lib/admin/queries", () => ({ getAccountsPageForAdmin: vi.fn() }));

describe("/admin/accounts", () => {
  beforeEach(() => {
    vi.mocked(getAccountsPageForAdmin).mockResolvedValue({
      accounts: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "ana@demo.local",
          nick: "Ana",
          roleGlobal: "user",
          blockedAt: null,
          createdAt: new Date("2026-11-14T10:00:00Z"),
        },
      ],
      hasNextPage: true,
      page: 2,
    });
  });

  it("reads the page the address asks for and shows its accounts", async () => {
    render(await AdminAccountsPage({ searchParams: Promise.resolve({ page: "2" }) }));

    expect(getAccountsPageForAdmin).toHaveBeenCalledWith("2");
    expect(screen.getByRole("heading", { level: 1, name: "Cuentas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ana@demo.local" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/admin/accounts?page=3");
  });

  // The account page's delete action comes back here with ?deleted=1 (#104)
  it("says the account was deleted when the delete action brought the Admin back", async () => {
    render(await AdminAccountsPage({ searchParams: Promise.resolve({ deleted: "1" }) }));

    expect(screen.getByRole("status")).toHaveTextContent("Cuenta borrada.");
  });

  it("says nothing about a deletion otherwise", async () => {
    render(await AdminAccountsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText("Cuenta borrada.")).not.toBeInTheDocument();
  });
});
