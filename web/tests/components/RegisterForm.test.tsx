import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/auth/RegisterForm";

// The form imports a Server Action: replaced, so the test needs no server
vi.mock("@/lib/auth/actions", () => ({
  registerAction: vi.fn(),
}));

describe("RegisterForm", () => {
  // #79: titles use Space Grotesk (font-heading), as DESIGN.md says
  it("shows its title as the page heading, in the heading font", () => {
    render(<RegisterForm />);

    expect(screen.getByRole("heading", { level: 1, name: "Crear Cuenta" })).toHaveClass("font-heading");
  });

  // #79: the link is a ghost Button with href (border, no volt fill), as Marta asked
  it("links to /login as a ghost button", () => {
    render(<RegisterForm />);

    const link = screen.getByRole("link", { name: "Inicia sesión aquí" });
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveClass("border-border-strong");
    expect(link).not.toHaveClass("bg-volt");
  });
});
