import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";
import { loginAction } from "@/lib/auth/actions";

vi.mock("@/lib/auth/actions", () => ({
  loginAction: vi.fn(),
}));

describe("LoginForm", () => {
  it("shows the notice it receives before any login attempt", () => {
    render(<LoginForm notice="Tu cuenta está bloqueada." />);

    expect(screen.getByText("Tu cuenta está bloqueada.")).toBeInTheDocument();
  });

  it("replaces the notice with the error of a failed login attempt", async () => {
    vi.mocked(loginAction).mockResolvedValue({
      success: false,
      error: "Email o contraseña incorrectos",
    });
    render(<LoginForm notice="Tu cuenta está bloqueada." />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "athlete1@demo.local" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Email o contraseña incorrectos")).toBeInTheDocument();
    expect(screen.queryByText("Tu cuenta está bloqueada.")).not.toBeInTheDocument();
  });
});
