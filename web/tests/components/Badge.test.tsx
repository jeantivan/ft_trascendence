import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders its children as text, so color is not the only signal", () => {
    render(<Badge variant="intervalos">Intervalos</Badge>);
    expect(screen.getByText("Intervalos")).toBeInTheDocument();
  });

  it.each([
    ["rodaje", "session-rodaje"],
    ["intervalos", "session-intervalos"],
    ["cuestas", "session-cuestas"],
    ["tirada-larga", "session-tirada-larga"],
    ["tirada_larga", "session-tirada-larga"],
    ["fartlek", "session-fartlek"],
    ["warning", "volume-alert"],
    ["success", "rpe-low"],
    ["info", "session-rodaje"],
    ["destructive", "rpe-max"],
  ] as const)("variant %s uses its token for text, border and 12%% background", (variant, token) => {
    render(
      <Badge variant={variant} data-testid="badge">
        Label
      </Badge>
    );
    expect(screen.getByTestId("badge")).toHaveClass(`text-${token}`, `border-${token}`, `bg-${token}/12`);
  });

  it("variant neutral uses surface-overlay, border-strong and text-secondary", () => {
    render(
      <Badge variant="neutral" data-testid="badge">
        Neutral
      </Badge>
    );
    expect(screen.getByTestId("badge")).toHaveClass("border-border-strong", "bg-surface-overlay", "text-text-secondary");
  });

  it("is an uppercase pill and lets className override its base", () => {
    render(<Badge variant="rodaje" data-testid="badge" className="px-4" />);
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveClass("rounded-full", "font-heading", "text-label-caps", "uppercase", "px-4");
    expect(badge).not.toHaveClass("px-2");
  });

  it("keeps its pill on one line and spaces an icon from the text", () => {
    render(<Badge variant="warning" data-testid="badge" />);
    expect(screen.getByTestId("badge")).toHaveClass("whitespace-nowrap", "gap-1");
  });

  it("renders numeric counters with tabular figures", () => {
    render(
      <Badge variant="info" data-testid="badge">
        {12}
      </Badge>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent("12");
    expect(badge).toHaveClass("tabular-nums");
  });
});
