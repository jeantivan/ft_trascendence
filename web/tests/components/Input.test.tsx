import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "@/components/ui/Input";

describe("Input", () => {
  it("renders an input and passes through its native props", () => {
    render(<Input type="email" name="email" placeholder="runner@42madrid.com" required />);
    const input = screen.getByPlaceholderText("runner@42madrid.com");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toBeRequired();
  });

  it("keeps its base style and lets className override it", () => {
    render(<Input placeholder="x" className="px-margin" />);
    const input = screen.getByPlaceholderText("x");
    expect(input).toHaveClass("h-12", "border-border-subtle", "bg-surface-overlay", "px-margin");
    expect(input).not.toHaveClass("px-3");
  });

  it("shows a red border when it is invalid", () => {
    render(<Input placeholder="x" aria-invalid="true" />);
    const input = screen.getByPlaceholderText("x");
    expect(input).toHaveClass("border-rpe-max");
    expect(input).not.toHaveClass("border-border-subtle");
  });

  it("focuses in volt", () => {
    render(<Input placeholder="x" />);
    expect(screen.getByPlaceholderText("x")).toHaveClass(
      "focus:border-volt",
      "focus-visible:outline-2",
      "focus-visible:outline-volt"
    );
  });

  it("keeps the red border and focuses in red when it is invalid", () => {
    render(<Input placeholder="x" aria-invalid="true" />);
    const input = screen.getByPlaceholderText("x");
    expect(input).toHaveClass("focus:border-rpe-max", "focus-visible:outline-rpe-max");
    expect(input).not.toHaveClass("focus:border-volt", "focus-visible:outline-volt");
  });

  it("looks disabled and shows a not-allowed cursor", () => {
    render(<Input placeholder="x" disabled />);
    const input = screen.getByPlaceholderText("x");
    expect(input).toBeDisabled();
    expect(input).toHaveClass("disabled:opacity-50", "disabled:cursor-not-allowed");
  });
});
