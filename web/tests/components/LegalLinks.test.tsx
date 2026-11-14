import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalLinks } from "@/components/ui/LegalLinks";

describe("LegalLinks", () => {
  it("links to the privacy policy and the terms", () => {
    render(<LegalLinks />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/privacy", "/terms"]);
  });
});
