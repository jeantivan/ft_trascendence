import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NAV_ITEMS } from "@/config/navigation";
import { Sidebar } from "@/components/Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("Sidebar", () => {
  it("renderiza un enlace por cada ruta con su destino", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    for (const { href, label } of NAV_ITEMS) {
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  it("marca solo la ruta actual", () => {
    render(<Sidebar />);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Dashboard");
  });
});
