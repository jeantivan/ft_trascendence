import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "@/components/ui/Card";

describe("Card", () => {
  it("renders a div with its children and passes through its native props", () => {
    render(<Card data-testid="card">Hello</Card>);
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("DIV");
    expect(card).toHaveTextContent("Hello");
  });

  it("keeps its base style and lets className override it", () => {
    render(<Card data-testid="card" className="p-4 flex" />);
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("rounded-lg", "border-border-subtle", "bg-surface-elevated", "p-4", "flex");
    expect(card).not.toHaveClass("p-6");
  });

  it("renders a labelled section with as=\"section\"", () => {
    render(
      <Card as="section" aria-labelledby="title">
        <h2 id="title">Borrar cuenta</h2>
      </Card>
    );
    expect(screen.getByRole("region", { name: "Borrar cuenta" }).tagName).toBe("SECTION");
  });

  it("has no left bar by default", () => {
    render(<Card data-testid="card" />);
    expect(screen.getByTestId("card")).not.toHaveClass("border-l-4");
  });

  it("adds the left bar in the color of the session type", () => {
    render(<Card data-testid="card" accent="tirada_larga" />);
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("border-l-4", "border-l-session-tirada-larga");
    expect(card).not.toHaveClass("border-l-session-rodaje");
  });
});
