import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "@/components/ui/Icon";

describe("Icon", () => {
  it("is decorative without title, hidden from screen readers", () => {
    const { container } = render(<Icon name="dashboard" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("is an image named by title when it has one", () => {
    render(<Icon name="dashboard" title="Dashboard" />);
    expect(screen.getByRole("img", { name: "Dashboard" })).not.toHaveAttribute("aria-hidden");
  });

  it("is 24px by default and takes size for width and height", () => {
    const { container } = render(
      <>
        <Icon name="help" />
        <Icon name="help" size={40} />
      </>,
    );
    const [small, big] = container.querySelectorAll("svg");
    expect(small).toHaveAttribute("width", "24");
    expect(small).toHaveAttribute("height", "24");
    expect(big).toHaveAttribute("width", "40");
    expect(big).toHaveAttribute("height", "40");
  });

  it("lets className reach the svg, so the icon can take its color", () => {
    const { container } = render(<Icon name="help" className="text-volt" />);
    expect(container.querySelector("svg")).toHaveClass("text-volt");
  });
});
