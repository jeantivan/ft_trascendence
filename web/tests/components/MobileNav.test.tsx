import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NAV_ITEMS } from "@/config/navigation";
import { MobileNav } from "@/components/MobileNav";
import { logoutAction } from "@/lib/auth/actions";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/lib/auth/actions", () => ({
  logoutAction: vi.fn(),
}));

describe("MobileNav", () => {
  it("empieza cerrado", () => {
    render(<MobileNav />);
    const button = screen.getByRole("button", { name: "Menú" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("abre y cierra con el botón", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    const button = screen.getByRole("button", { name: "Cerrar" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link")).toHaveLength(NAV_ITEMS.length);

    fireEvent.click(button);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("aria-controls apunta al panel abierto", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    const id = screen
      .getByRole("button", { name: "Cerrar" })
      .getAttribute("aria-controls");
    expect(screen.getByRole("navigation")).toHaveAttribute("id", id);
  });

  it("cierra con Escape", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("cierra al pulsar un enlace", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    const link = screen.getByRole("link", { name: "Club" });
    // jsdom no implementa navegar: cancelamos solo el comportamiento por defecto
    link.addEventListener("click", (e) => e.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("muestra el botón de cerrar sesión solo con el menú abierto", () => {
    render(<MobileNav />);
    expect(
      screen.queryByRole("button", { name: /cerrar sesión/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    expect(
      screen.getByRole("button", { name: /cerrar sesión/i }),
    ).toBeInTheDocument();
  });

  it("pulsar cerrar sesión envía el formulario aunque el menú se cierre", async () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    fireEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));
    await waitFor(() => expect(logoutAction).toHaveBeenCalled());
  });

  it("pulsar cerrar sesión no desmonta el formulario antes de enviarlo", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    const logout = screen.getByRole("button", { name: /cerrar sesión/i });
    fireEvent.click(logout);
    // Si el menú se cierra aquí, el navegador cancela el envío del formulario
    expect(logout).toBeInTheDocument();
  });
});
