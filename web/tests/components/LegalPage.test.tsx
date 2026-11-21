import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalPage } from "@/components/LegalPage";

describe("LegalPage", () => {
  it.each([
    ["privacy-policy.md", "Política de Privacidad"],
    ["terms-of-service.md", "Términos de Servicio"],
    ["cookie-policy.md", "Política de Cookies"],
  ])("renderiza %s sin bandera de entorno, sin aviso de borrador ni huecos [CORCHETES]", async (file, title) => {
    const { container, unmount } = render(await LegalPage({ file }));

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/borrador/i);
    // Any remaining [PLACEHOLDER] would show up as literal brackets in the rendered text
    expect(container.textContent).not.toMatch(/\[[^\]]+\]/);
    unmount();
  });
});
