import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogoutButton } from "@/components/LogoutButton";

vi.mock("@/lib/auth/actions", () => ({
  logoutAction: vi.fn(),
}));

describe("LogoutButton", () => {
  it("renderiza un botón de envío dentro de un formulario", () => {
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: /cerrar sesión/i });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
  });
});
