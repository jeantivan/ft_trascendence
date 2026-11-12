import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "@/components/ui/Logo";

describe("Logo", () => {
  it("is an image named StrideSync", () => {
    render(<Logo />);
    expect(screen.getByRole("img", { name: "StrideSync" })).toBeInTheDocument();
  });

  it("shows mark and text by default, and only the mark with variant mark", () => {
    render(
      <>
        <Logo data-testid="full" />
        <Logo data-testid="mark" variant="mark" />
      </>,
    );
    expect(screen.getByTestId("full")).toHaveAttribute("viewBox", "0 0 210 48");
    expect(screen.getByTestId("mark")).toHaveAttribute("viewBox", "0 0 48 48");
  });

  it("lets className give the size", () => {
    render(<Logo className="h-8 w-auto" />);
    expect(screen.getByRole("img", { name: "StrideSync" })).toHaveClass("h-8", "w-auto");
  });
});
