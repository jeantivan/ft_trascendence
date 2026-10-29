export interface RouteAccessCheck {
  pathname: string;
  isLoggedIn: boolean;
}

export type RouteAccessResult =
  | { allowed: true }
  | { allowed: false; redirectTo: string }
  | { allowed: false; status: 401 };

// /auth/signed-out must stay public: otherwise the proxy would drop
// ?reason=blocked, or store it in callbackUrl and sign the user out again
// right after login
const PUBLIC_EXACT_ROUTES = ["/", "/login", "/register", "/auth/signed-out"];

export function checkRouteAccess({
  pathname,
  isLoggedIn,
}: RouteAccessCheck): RouteAccessResult {
  if (pathname.startsWith("/api/auth")) {
    return { allowed: true };
  }

  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  const isPublic = PUBLIC_EXACT_ROUTES.includes(normalizedPath);

  if (isLoggedIn && (normalizedPath === "/login" || normalizedPath === "/register")) {
    return { allowed: false, redirectTo: "/dashboard" };
  }

  if (isPublic) {
    return { allowed: true };
  }

  if (!isLoggedIn) {
    if (normalizedPath.startsWith("/api/")) {
      return { allowed: false, status: 401 };
    }
    return { allowed: false, redirectTo: "/login" };
  }

  return { allowed: true };
}
