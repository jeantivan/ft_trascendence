import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { icons } from "@/components/ui/icons";

describe("EmptyState", () => {
  it("renders title, description and action", () => {
    render(
      <EmptyState
        title="Sin plantillas"
        description="Crea la primera plantilla para tu club."
        action={<Button>Nueva plantilla</Button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Sin plantillas" })).toBeInTheDocument();
    expect(screen.getByText("Crea la primera plantilla para tu club.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva plantilla" })).toBeInTheDocument();
  });

  it("renders a design system icon when icon is an IconName", () => {
    const { container } = render(<EmptyState icon="groups" title="Sin club" />);
    expect(container.querySelector("path")).toHaveAttribute("d", icons.groups);
  });

  it("renders a custom ReactNode when icon is JSX", () => {
    render(<EmptyState icon={<span data-testid="custom-icon">!</span>} title="Vacío" />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("uses Card surface in card variant and omits border in plain variant", () => {
    const { rerender } = render(<EmptyState data-testid="empty" title="Card" />);
    expect(screen.getByTestId("empty")).toHaveClass("rounded-lg", "border-border-subtle", "bg-surface-elevated");

    rerender(<EmptyState data-testid="empty" variant="plain" title="Plain" />);
    const plain = screen.getByTestId("empty");
    expect(plain).not.toHaveClass("border-border-subtle", "bg-surface-elevated");
  });

  it("adds role=status only when live is true", () => {
    const { rerender } = render(<EmptyState title="Sin resultados" />);
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<EmptyState live title="Sin resultados" />);
    expect(screen.getByRole("status")).toHaveTextContent("Sin resultados");
  });
});
