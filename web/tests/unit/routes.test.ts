import { describe, expect, it } from "vitest";
import { checkRouteAccess } from "@/lib/auth/routes";

describe("checkRouteAccess - Route Protection", () => {
  it("redirects unauthenticated user from protected route to /login", () => {
    const result = checkRouteAccess({
      pathname: "/dashboard",
      isLoggedIn: false,
    });
    expect(result).toEqual({ allowed: false, redirectTo: "/login" });
  });

  it("allows unauthenticated user to access /login and /register", () => {
    expect(
      checkRouteAccess({ pathname: "/login", isLoggedIn: false })
    ).toEqual({ allowed: true });

    expect(
      checkRouteAccess({ pathname: "/register", isLoggedIn: false })
    ).toEqual({ allowed: true });
  });

  it("allows authenticated user to access protected routes", () => {
    expect(
      checkRouteAccess({ pathname: "/dashboard", isLoggedIn: true })
    ).toEqual({ allowed: true });

    expect(
      checkRouteAccess({ pathname: "/training", isLoggedIn: true })
    ).toEqual({ allowed: true });

    expect(
      checkRouteAccess({ pathname: "/events", isLoggedIn: true })
    ).toEqual({ allowed: true });
  });

  it("redirects authenticated user away from /login and /register to /dashboard", () => {
    expect(
      checkRouteAccess({ pathname: "/login", isLoggedIn: true })
    ).toEqual({ allowed: false, redirectTo: "/dashboard" });

    expect(
      checkRouteAccess({ pathname: "/register", isLoggedIn: true })
    ).toEqual({ allowed: false, redirectTo: "/dashboard" });
  });

  it("allows anyone to access root path and /api/auth", () => {
    expect(
      checkRouteAccess({ pathname: "/", isLoggedIn: false })
    ).toEqual({ allowed: true });

    expect(
      checkRouteAccess({ pathname: "/api/auth/session", isLoggedIn: false })
    ).toEqual({ allowed: true });
  });

  it("handles paths with trailing slashes gracefully", () => {
    expect(
      checkRouteAccess({ pathname: "/login/", isLoggedIn: false })
    ).toEqual({ allowed: true });

    expect(
      checkRouteAccess({ pathname: "/register/", isLoggedIn: false })
    ).toEqual({ allowed: true });

    expect(
      checkRouteAccess({ pathname: "/login/", isLoggedIn: true })
    ).toEqual({ allowed: false, redirectTo: "/dashboard" });

    expect(
      checkRouteAccess({ pathname: "/dashboard/", isLoggedIn: false })
    ).toEqual({ allowed: false, redirectTo: "/login" });
  });

  it("denies unauthenticated requests to /api/* with 401 status", () => {
    expect(
      checkRouteAccess({ pathname: "/api/events", isLoggedIn: false })
    ).toEqual({ allowed: false, status: 401 });

    expect(
      checkRouteAccess({ pathname: "/api/user/profile", isLoggedIn: false })
    ).toEqual({ allowed: false, status: 401 });
  });
});
