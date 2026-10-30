import { describe, expect, it } from "vitest";
import { loginNotice } from "@/lib/permissions/login-notice";

describe("loginNotice", () => {
  it("returns the blocked account notice for error=blocked", () => {
    expect(loginNotice("blocked")).toBe(
      "Tu cuenta está bloqueada. Si crees que es un error, contacta con un administrador."
    );
  });

  it.each([
    ["an unknown value", "Llama al 600 000 000 para recuperar tu cuenta"],
    ["a built-in object property", "toString"],
    ["an empty value", ""],
    ["no value", undefined],
  ])("returns nothing for %s, never text taken from the URL", (_case, error) => {
    expect(loginNotice(error)).toBeUndefined();
  });
});
