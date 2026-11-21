import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "@/components/ui/Select";

describe("Select", () => {
  it("renders a native select, forwards its props, and lets className override base classes", () => {
    const onChange = vi.fn();
    render(
      <Select id="session-type" name="sessionType" required className="pl-6" onChange={onChange}>
        <option value="rodaje">Rodaje</option>
        <option value="intervalos">Intervalos</option>
      </Select>
    );

    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("id", "session-type");
    expect(select).toHaveAttribute("name", "sessionType");
    expect(select).toBeRequired();
    expect(select).toHaveClass("h-12", "w-full", "appearance-none", "pl-6");
    expect(select).not.toHaveClass("pl-3");

    fireEvent.change(select, { target: { value: "intervalos" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(select).toHaveValue("intervalos");
  });

  it("renders a decorative chevron-down icon that does not block pointer clicks", () => {
    const { container } = render(
      <Select aria-label="Club">
        <option value="demo">Club Demo</option>
      </Select>
    );

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("pointer-events-none", "text-text-secondary");
  });

  it("focuses in volt", () => {
    render(
      <Select aria-label="Club">
        <option value="demo">Club Demo</option>
      </Select>
    );

    expect(screen.getByRole("combobox")).toHaveClass(
      "focus:border-volt",
      "focus-visible:outline-2",
      "focus-visible:outline-volt"
    );
  });

  it("shows a red border and red focus when invalid", () => {
    render(
      <Select aria-label="Club" aria-invalid="true">
        <option value="demo">Club Demo</option>
      </Select>
    );

    const select = screen.getByRole("combobox");
    expect(select).toHaveClass("border-rpe-max", "focus:border-rpe-max", "focus-visible:outline-rpe-max");
    expect(select).not.toHaveClass(
      "border-border-subtle",
      "focus:border-volt",
      "focus-visible:outline-volt"
    );
  });

  it("looks disabled and dims both the control and chevron icon", () => {
    const { container } = render(
      <Select aria-label="Club" disabled>
        <option value="demo">Club Demo</option>
      </Select>
    );

    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
    expect(select).toHaveClass("peer", "disabled:opacity-50", "disabled:cursor-not-allowed");
    expect(container.querySelector("svg")).toHaveClass("peer-disabled:opacity-50");
  });

  it("renders a disabled empty placeholder option and muted styling class when provided", () => {
    render(
      <Select aria-label="Club" placeholder="Elige un club" defaultValue="">
        <option value="demo">Club Demo</option>
      </Select>
    );

    const select = screen.getByRole("combobox");
    const placeholderOption = screen.getByRole("option", { name: "Elige un club" });
    expect(placeholderOption).toHaveAttribute("value", "");
    expect(placeholderOption).toBeDisabled();
    expect(select).toHaveValue("");
    expect(select).toHaveClass('has-[option[value=""]:checked]:text-text-muted');
  });

  it("renders options from an options array including disabled items", () => {
    render(
      <Select
        aria-label="Session Type"
        defaultValue="rodaje"
        options={[
          { value: "rodaje", label: "Rodaje" },
          { value: "intervalos", label: "Intervalos", disabled: true },
        ]}
      />
    );

    expect(screen.getByRole("option", { name: "Rodaje" })).toHaveAttribute("value", "rodaje");
    const disabledOption = screen.getByRole("option", { name: "Intervalos" });
    expect(disabledOption).toHaveAttribute("value", "intervalos");
    expect(disabledOption).toBeDisabled();
  });
});
