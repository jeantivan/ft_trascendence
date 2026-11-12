import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";

describe("FormField", () => {
  it("links the label to its control", () => {
    render(
      <FormField label="Email" htmlFor="email">
        <Input id="email" name="email" />
      </FormField>
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
  });

  it("styles the label with the design tokens and stacks it over the control", () => {
    const { container } = render(
      <FormField label="Email" htmlFor="email">
        <Input id="email" />
      </FormField>
    );
    expect(screen.getByText("Email")).toHaveClass("text-body-sm", "font-medium", "text-text-primary");
    expect(container.firstChild).toHaveClass("flex", "flex-col", "gap-1");
  });

  it("announces the error as an alert in red", () => {
    render(
      <FormField label="Email" htmlFor="email" error="Email not valid">
        <Input id="email" />
      </FormField>
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Email not valid");
    expect(alert).toHaveClass("text-body-sm", "text-rpe-max");
  });

  it("marks the control as invalid and describes it with the error", () => {
    render(
      <FormField label="Email" htmlFor="email" error="Email not valid">
        <Input id="email" />
      </FormField>
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Email not valid");
  });

  it("shows no alert when there is no error", () => {
    render(
      <FormField label="Email" htmlFor="email">
        <Input id="email" />
      </FormField>
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
