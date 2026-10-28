import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/app/error";

describe("error (500)", () => {
  it("muestra el 500 y enlaza al Dashboard", () => {
    render(<ErrorBoundary retry={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "500" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("llama a retry al pulsar Reintentar", () => {
    const retry = vi.fn();
    render(<ErrorBoundary retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
