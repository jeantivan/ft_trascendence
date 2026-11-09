import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

// npm test runs from the web/ folder (in Docker too)
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

// Names of the custom properties that start with the prefix, e.g. "--spacing-" gives
// "margin". Skips the sub-properties of the type scale (--text-body-sm--line-height)
function tokens(prefix: string): string[] {
  const names = [...css.matchAll(new RegExp(`--${prefix}-([a-z-]+):`, "g"))].map((m) => m[1]);
  return names.filter((name) => !name.includes("--"));
}

describe("cn", () => {
  it("lets a later class override an earlier one of the same kind", () => {
    expect(cn("px-6", "px-2")).toBe("px-2");
  });

  it("ignores empty values", () => {
    expect(cn("px-6", undefined, false, "py-2")).toBe("px-6 py-2");
  });
});

// If a token is missing from cn.ts, tailwind-merge keeps both classes and the CSS order
// decides which one wins. These tests read globals.css, so a new token fails here
describe("cn knows every token of globals.css", () => {
  it.each(tokens("spacing"))("spacing: px-%s replaces px-6", (token) => {
    expect(cn("px-6", `px-${token}`)).toBe(`px-${token}`);
  });

  it.each(tokens("text"))("text: text-%s replaces a font size and keeps the color", (token) => {
    expect(cn("text-xs", `text-${token}`)).toBe(`text-${token}`);
    expect(cn("text-text-primary", `text-${token}`)).toBe(`text-text-primary text-${token}`);
  });

  it.each(tokens("shadow"))("shadow: shadow-%s replaces shadow-sm", (token) => {
    expect(cn("shadow-sm", `shadow-${token}`)).toBe(`shadow-${token}`);
  });

  it.each(tokens("container"))("container: max-w-%s replaces max-w-xl", (token) => {
    expect(cn("max-w-xl", `max-w-${token}`)).toBe(`max-w-${token}`);
  });

  it("finds tokens in each group, so a wrong pattern cannot pass without testing anything", () => {
    expect(tokens("spacing")).toContain("margin");
    expect(tokens("text")).toContain("body-sm");
    expect(tokens("text")).not.toContain("body-sm--line-height");
    expect(tokens("shadow")).toContain("button-glow");
    expect(tokens("container")).toContain("content");
  });
});
