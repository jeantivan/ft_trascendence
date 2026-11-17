import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountsList } from "@/components/admin/AccountsList";
import type { AccountSummary } from "@/lib/admin/accounts";

const ana: AccountSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@demo.local",
  nick: "Ana",
  roleGlobal: "admin",
  blockedAt: null,
  createdAt: new Date("2026-11-14T10:00:00Z"),
};

const bea: AccountSummary = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "bea@demo.local",
  nick: null,
  roleGlobal: "user",
  blockedAt: new Date("2026-11-13T10:00:00Z"),
  createdAt: new Date("2026-10-01T10:00:00Z"),
};

const rowOf = (email: string) => screen.getByRole("row", { name: new RegExp(email) });

describe("AccountsList", () => {
  it("shows each account's email, nick, role and sign-up date", () => {
    render(<AccountsList accounts={[ana, bea]} page={1} hasNextPage={false} />);

    const first = within(rowOf("ana@demo.local"));
    expect(first.getByText("Ana")).toBeInTheDocument();
    expect(first.getByText("Administrador")).toBeInTheDocument();
    expect(first.getByText("14/11/2026")).toBeInTheDocument();

    const second = within(rowOf("bea@demo.local"));
    expect(second.getByText("Sin nick")).toBeInTheDocument();
    expect(second.getByText("Usuario")).toBeInTheDocument();
  });

  it("tags the blocked accounts, and only those", () => {
    render(<AccountsList accounts={[ana, bea]} page={1} hasNextPage={false} />);

    expect(within(rowOf("bea@demo.local")).getByText("Bloqueada")).toBeInTheDocument();
    expect(within(rowOf("ana@demo.local")).queryByText("Bloqueada")).not.toBeInTheDocument();
  });

  it("links each account to its page", () => {
    render(<AccountsList accounts={[ana]} page={1} hasNextPage={false} />);

    expect(screen.getByRole("link", { name: "ana@demo.local" })).toHaveAttribute(
      "href",
      `/admin/accounts/${ana.id}`,
    );
  });

  it("on page 1 there is no previous link, and next only when there are more accounts", () => {
    render(<AccountsList accounts={[ana]} page={1} hasNextPage />);

    expect(screen.queryByRole("link", { name: "Anterior" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/admin/accounts?page=2");
  });

  it("on the last page there is a previous link and no next", () => {
    render(<AccountsList accounts={[ana]} page={3} hasNextPage={false} />);

    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/admin/accounts?page=2");
    expect(screen.queryByRole("link", { name: "Siguiente" })).not.toBeInTheDocument();
  });

  it("says so when the page has no accounts", () => {
    render(<AccountsList accounts={[]} page={1} hasNextPage={false} />);

    expect(screen.getByText("No hay cuentas en esta página.")).toBeInTheDocument();
  });
});
