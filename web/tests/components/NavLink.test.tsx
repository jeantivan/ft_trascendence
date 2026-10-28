import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavLink } from "@/components/NavLink";

const mockPathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

describe("NavLink", () => {
  it("marca la página actual con aria-current", () => {
    mockPathname.mockReturnValue("/club");
    render(<NavLink href="/club" label="Club" />);
    expect(screen.getByRole("link", { name: "Club" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("no marca aria-current en otra página", () => {
    mockPathname.mockReturnValue("/events");
    render(<NavLink href="/club" label="Club" />);
    expect(screen.getByRole("link", { name: "Club" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("no marca una ruta con prefijo parecido", () => {
    mockPathname.mockReturnValue("/events-old");
    render(<NavLink href="/events" label="Eventos" />);
    expect(screen.getByRole("link", { name: "Eventos" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marca como activa una subruta", () => {
    mockPathname.mockReturnValue("/events/12");
    render(<NavLink href="/events" label="Eventos" />);
    expect(screen.getByRole("link", { name: "Eventos" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
