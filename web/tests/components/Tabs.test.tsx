import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

describe("Tabs", () => {
  it("switches panels in uncontrolled mode and connects ARIA attributes", () => {
    render(
      <Tabs defaultValue="perfil">
        <TabsList aria-label="Ajustes">
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="privacidad" icon="lock" badge={<span>2</span>}>
            Privacidad
          </TabsTrigger>
        </TabsList>
        <TabsContent value="perfil">Panel de perfil</TabsContent>
        <TabsContent value="privacidad">Panel de privacidad</TabsContent>
      </Tabs>
    );

    const perfilTab = screen.getByRole("tab", { name: "Perfil" });
    const privacidadTab = screen.getByRole("tab", { name: /privacidad/i });

    expect(perfilTab).toHaveAttribute("aria-selected", "true");
    expect(perfilTab).toHaveAttribute("tabindex", "0");
    expect(privacidadTab).toHaveAttribute("aria-selected", "false");
    expect(privacidadTab).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText("Panel de perfil")).toBeInTheDocument();
    expect(screen.queryByText("Panel de privacidad")).not.toBeInTheDocument();

    fireEvent.click(privacidadTab);

    expect(privacidadTab).toHaveAttribute("aria-selected", "true");
    expect(privacidadTab).toHaveAttribute("tabindex", "0");
    expect(perfilTab).toHaveAttribute("aria-selected", "false");
    expect(perfilTab).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByText("Panel de perfil")).not.toBeInTheDocument();

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("Panel de privacidad");
    expect(panel).toHaveAttribute("aria-labelledby", privacidadTab.id);
    expect(privacidadTab).toHaveAttribute("aria-controls", panel.id);
  });

  it("supports controlled mode with value and onValueChange", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Tabs value="uno" onValueChange={onValueChange}>
        <TabsList aria-label="Secciones">
          <TabsTrigger value="uno">Uno</TabsTrigger>
          <TabsTrigger value="dos">Dos</TabsTrigger>
        </TabsList>
        <TabsContent value="uno">Contenido uno</TabsContent>
        <TabsContent value="dos">Contenido dos</TabsContent>
      </Tabs>
    );

    fireEvent.click(screen.getByRole("tab", { name: "Dos" }));
    expect(onValueChange).toHaveBeenCalledWith("dos");
    expect(screen.getByText("Contenido uno")).toBeInTheDocument();

    rerender(
      <Tabs value="dos" onValueChange={onValueChange}>
        <TabsList aria-label="Secciones">
          <TabsTrigger value="uno">Uno</TabsTrigger>
          <TabsTrigger value="dos">Dos</TabsTrigger>
        </TabsList>
        <TabsContent value="uno">Contenido uno</TabsContent>
        <TabsContent value="dos">Contenido dos</TabsContent>
      </Tabs>
    );
    expect(screen.getByText("Contenido dos")).toBeInTheDocument();
  });

  it("navigates with ArrowLeft, ArrowRight, Home and End skipping disabled tabs", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Navegación">
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b" disabled>
            Tab B
          </TabsTrigger>
          <TabsTrigger value="c">Tab C</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
        <TabsContent value="c">Panel C</TabsContent>
      </Tabs>
    );

    const tabA = screen.getByRole("tab", { name: "Tab A" });
    const tabC = screen.getByRole("tab", { name: "Tab C" });

    tabA.focus();
    fireEvent.keyDown(tabA, { key: "ArrowRight" });
    expect(tabC).toHaveFocus();
    expect(screen.getByText("Panel C")).toBeInTheDocument();

    fireEvent.keyDown(tabC, { key: "ArrowRight" });
    expect(tabA).toHaveFocus();
    expect(screen.getByText("Panel A")).toBeInTheDocument();

    fireEvent.keyDown(tabA, { key: "End" });
    expect(tabC).toHaveFocus();

    fireEvent.keyDown(tabC, { key: "Home" });
    expect(tabA).toHaveFocus();
  });

  it("moves focus without activating in manual activationMode", () => {
    render(
      <Tabs defaultValue="a" activationMode="manual">
        <TabsList aria-label="Manual">
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>
    );

    const tabA = screen.getByRole("tab", { name: "Tab A" });
    const tabB = screen.getByRole("tab", { name: "Tab B" });

    tabA.focus();
    fireEvent.keyDown(tabA, { key: "ArrowRight" });

    expect(tabB).toHaveFocus();
    expect(screen.getByText("Panel A")).toBeInTheDocument();

    fireEvent.click(tabB);
    expect(screen.getByText("Panel B")).toBeInTheDocument();
  });

  it("keeps inactive panels mounted when keepMounted is true", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="KeepMounted">
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a" keepMounted>
          Panel A
        </TabsContent>
        <TabsContent value="b" keepMounted>
          Panel B
        </TabsContent>
      </Tabs>
    );

    const panelA = screen.getByText("Panel A");
    const panelB = screen.getByText("Panel B", { selector: "[role='tabpanel']" });
    expect(panelA).toBeVisible();
    expect(panelB).toHaveAttribute("hidden");
    expect(panelB).toHaveClass("hidden");
  });

  it("applies underline variant tokens", () => {
    render(
      <Tabs defaultValue="a" variant="underline">
        <TabsList aria-label="Subrayado">
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
      </Tabs>
    );

    expect(screen.getByRole("tablist")).toHaveClass("border-b", "border-border-subtle");
    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveClass("border-volt", "text-volt");
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveClass("text-text-secondary");
  });
});
