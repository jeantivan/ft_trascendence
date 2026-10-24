import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicHeader } from "@/components/PublicHeader";

describe("PublicHeader", () => {
  it("enlaza a la aplicación con una ruta fija, sin depender del historial", () => {
    render(<PublicHeader />);
    expect(
      screen.getByRole("link", { name: "Volver a la aplicación" }),
    ).toHaveAttribute("href", "/dashboard");
  });

  it("no incluye menú ni navegación lateral", () => {
    render(<PublicHeader />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
