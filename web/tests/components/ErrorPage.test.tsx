import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorPage } from "@/components/ErrorPage";

const props = {
  code: "404",
  label: "Ruta no encontrada",
  title: "Te has salido del track.",
  description: "La ruta no existe.",
  tone: "volt",
} as const;

describe("ErrorPage", () => {
  it("muestra el código, el título y la descripción", () => {
    render(<ErrorPage {...props} />);
    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Te has salido del track." }),
    ).toBeInTheDocument();
    expect(screen.getByText("La ruta no existe.")).toBeInTheDocument();
  });

  it("renderiza los children", () => {
    render(
      <ErrorPage {...props}>
        <button>Probar</button>
      </ErrorPage>,
    );
    expect(screen.getByRole("button", { name: "Probar" })).toBeInTheDocument();
  });

  it("no falla sin children", () => {
    render(<ErrorPage {...props} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
