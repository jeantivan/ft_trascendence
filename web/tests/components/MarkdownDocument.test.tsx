import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownDocument } from "@/components/MarkdownDocument";

describe("MarkdownDocument", () => {
  it("convierte el enlace privacy-policy.md en /privacy y deja los demás igual", () => {
    render(
      <MarkdownDocument>
        {"Lee la [Política](privacy-policy.md) y [otra](https://example.com)."}
      </MarkdownDocument>,
    );
    expect(screen.getByRole("link", { name: "Política" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "otra" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("pinta las tablas dentro de un contenedor con scroll horizontal", () => {
    render(
      <MarkdownDocument>
        {"| Dato | Plazo |\n|---|---|\n| Mensajes | 12 meses |"}
      </MarkdownDocument>,
    );
    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
  });
});
