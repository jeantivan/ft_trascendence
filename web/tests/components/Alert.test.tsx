import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert } from "@/components/ui/Alert";
import { icons } from "@/components/ui/icons";

describe("Alert", () => {
  it("announces an error as an alert", () => {
    render(<Alert variant="error">Credenciales incorrectas</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Credenciales incorrectas");
  });

  it("announces a success politely as a status", () => {
    render(<Alert variant="success">Cuenta creada</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Cuenta creada");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("paints an error with the red border on an elevated surface", () => {
    render(<Alert variant="error">Credenciales incorrectas</Alert>);
    expect(screen.getByRole("alert")).toHaveClass("rounded", "border", "border-rpe-max", "bg-surface-elevated");
  });

  it("paints a success with the green border, not the red one", () => {
    render(<Alert variant="success">Cuenta creada</Alert>);
    const alert = screen.getByRole("status");
    expect(alert).toHaveClass("border-rpe-low");
    expect(alert).not.toHaveClass("border-rpe-max");
  });

  it("announces an info as a status with the cyan border", () => {
    render(<Alert variant="info">Código enviado</Alert>);
    expect(screen.getByRole("status")).toHaveClass("border-session-rodaje");
  });

  it("shows the warning icon on an error", () => {
    const { container } = render(<Alert variant="error">Credenciales incorrectas</Alert>);
    expect(container.querySelector("path")).toHaveAttribute("d", icons.warning);
  });

  it("shows the check icon on a success", () => {
    const { container } = render(<Alert variant="success">Cuenta creada</Alert>);
    expect(container.querySelector("path")).toHaveAttribute("d", icons.check);
  });

  it("lays out the icon beside the text with padding and the body-sm token", () => {
    render(<Alert variant="info">Código enviado</Alert>);
    expect(screen.getByRole("status")).toHaveClass(
      "flex",
      "items-start",
      "gap-2",
      "p-3",
      "text-body-sm",
      "text-text-primary"
    );
  });

  it("keeps the icon at full size and breaks long unbroken text", () => {
    const { container } = render(<Alert variant="error">abcdefghijklmnopqrstuvwxyz0123456789</Alert>);
    expect(container.querySelector("svg")).toHaveClass("shrink-0");
    expect(screen.getByRole("alert")).toHaveClass("min-w-0", "wrap-anywhere");
  });
});
