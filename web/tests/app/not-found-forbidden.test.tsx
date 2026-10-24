import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Forbidden from "@/app/forbidden";
import NotFound from "@/app/not-found";

describe("not-found (404)", () => {
  it("muestra el 404 y enlaza al Dashboard y a los Events", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Ver próximos Events" })).toHaveAttribute(
      "href",
      "/events",
    );
  });
});

describe("forbidden (403)", () => {
  it("muestra el 403 y enlaza al Dashboard", () => {
    render(<Forbidden />);
    expect(screen.getByRole("heading", { level: 1, name: "403" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("no revela qué rol da acceso", () => {
    render(<Forbidden />);
    expect(screen.queryByText(/manager|admin|athlete/i)).toBeNull();
  });
});
