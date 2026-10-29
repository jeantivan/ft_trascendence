import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegalDraftPage } from "@/components/LegalDraftPage";

const readFile = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", () => ({ readFile }));

describe("LegalDraftPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    readFile.mockReset();
  });

  it.each([undefined, "", "false", "1", "TRUE"])(
    "devuelve 404 sin leer el documento si LEGAL_DRAFTS_ENABLED es %j",
    async (value) => {
      vi.stubEnv("LEGAL_DRAFTS_ENABLED", value);
      await expect(LegalDraftPage({ file: "x.md" })).rejects.toMatchObject({
        digest: expect.stringContaining("404"),
      });
      expect(readFile).not.toHaveBeenCalled();
    },
  );

  it("con LEGAL_DRAFTS_ENABLED=true pinta el aviso de borrador y el documento", async () => {
    vi.stubEnv("LEGAL_DRAFTS_ENABLED", "true");
    readFile.mockResolvedValue("# Título de prueba");
    render(await LegalDraftPage({ file: "x.md" }));
    expect(screen.getByText(/Borrador interno/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Título de prueba" }),
    ).toBeInTheDocument();
  });
});
