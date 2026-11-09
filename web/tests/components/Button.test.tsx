import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("is type=button by default, so it does not submit a form", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("keeps the type it is given", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });

  it("is a link when it has href", () => {
    render(<Button href="/events">See Events</Button>);
    expect(screen.getByRole("link", { name: "See Events" })).toHaveAttribute("href", "/events");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lets className override the variant", () => {
    render(<Button className="bg-surface-overlay px-margin">Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("bg-surface-overlay", "px-margin");
    expect(button).not.toHaveClass("bg-volt", "px-6");
  });

  it("focuses in volt, and in red for destructive", () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="destructive">Delete</Button>
      </>,
    );
    const primary = screen.getByRole("button", { name: "Primary" });
    expect(primary).toHaveClass("focus-visible:outline-volt");
    const destructive = screen.getByRole("button", { name: "Delete" });
    expect(destructive).toHaveClass("focus-visible:outline-rpe-max");
    expect(destructive).not.toHaveClass("focus-visible:outline-volt");
  });
});
