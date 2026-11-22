import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "@/components/ui/Switch";

describe("Switch", () => {
  it("toggles in uncontrolled mode and exposes accessible label and description", () => {
    render(
      <Switch
        defaultChecked={false}
        label="Estadísticas públicas"
        description="Muestra tus kilómetros agregados al club."
      />
    );

    const toggle = screen.getByRole("switch", { name: "Estadísticas públicas" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription("Muestra tus kilómetros agregados al club.");
    expect(toggle).toHaveClass("border-border-strong", "bg-surface-overlay");

    fireEvent.click(screen.getByText("Estadísticas públicas"));
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveClass("border-volt", "bg-volt");
  });

  it("supports controlled mode with checked and onCheckedChange", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Switch
        aria-label="Notificaciones"
        checked={false}
        onCheckedChange={onCheckedChange}
      />
    );

    const toggle = screen.getByRole("switch", { name: "Notificaciones" });
    fireEvent.click(toggle);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    rerender(
      <Switch
        aria-label="Notificaciones"
        checked
        onCheckedChange={onCheckedChange}
      />
    );
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("does not toggle when disabled and marks invalid border with aria-invalid", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="Consentimiento"
        disabled
        aria-invalid
        onCheckedChange={onCheckedChange}
      />
    );

    const toggle = screen.getByRole("switch", { name: "Consentimiento" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveClass("border-rpe-max", "disabled:opacity-50");

    fireEvent.click(toggle);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("submits hidden input value in a form only when checked", () => {
    const { container } = render(
      <form>
        <Switch aria-label="Online" name="showOnline" value="yes" defaultChecked={false} />
      </form>
    );

    const form = container.querySelector("form") as HTMLFormElement;
    expect(new FormData(form).get("showOnline")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Online" }));
    expect(new FormData(form).get("showOnline")).toBe("yes");
  });
});
