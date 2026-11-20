import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountProfile } from "@/components/admin/AccountProfile";
import type { AccountDetail } from "@/lib/admin/accounts";

const account: AccountDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@demo.local",
  nick: "Ana",
  roleGlobal: "user",
  blockedAt: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  clubs: [
    { id: "33333333-3333-4333-8333-333333333333", name: "Club Norte", role: "manager" },
    { id: "44444444-4444-4444-8444-444444444444", name: "Club Sur", role: "athlete" },
  ],
};

const field = (term: string) => screen.getByText(term).nextElementSibling as HTMLElement;

describe("AccountProfile", () => {
  it("shows the account's email, nick, role, state and sign-up date", () => {
    render(<AccountProfile account={account} />);

    expect(screen.getByRole("heading", { level: 2, name: "ana@demo.local" })).toBeInTheDocument();
    expect(field("Nick")).toHaveTextContent("Ana");
    expect(field("Rol")).toHaveTextContent("Usuario");
    expect(field("Estado")).toHaveTextContent("Activa");
    expect(field("Alta")).toHaveTextContent("01/10/2026");
  });

  it("a blocked account says since when", () => {
    render(<AccountProfile account={{ ...account, blockedAt: new Date("2026-11-13T10:00:00Z") }} />);

    expect(field("Estado")).toHaveTextContent("Bloqueada desde el 13/11/2026");
  });

  it("an account without nick says so", () => {
    render(<AccountProfile account={{ ...account, nick: null }} />);

    expect(field("Nick")).toHaveTextContent("Sin nick");
  });

  it("lists the clubs with the role in each one", () => {
    render(<AccountProfile account={account} />);

    const clubs = within(screen.getByRole("list", { name: "Clubes" }));
    expect(clubs.getByText("Club Norte").closest("li")).toHaveTextContent("Manager");
    expect(clubs.getByText("Club Sur").closest("li")).toHaveTextContent("Athlete");
  });

  it("an account with no club says so", () => {
    render(<AccountProfile account={{ ...account, clubs: [] }} />);

    expect(screen.getByText("No es miembro de ningún club.")).toBeInTheDocument();
  });
});
