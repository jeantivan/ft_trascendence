export interface RouteAccessCheck {
  pathname: string;
  isLoggedIn: boolean;
}

export type RouteAccessResult =
  | { allowed: true }
  | { allowed: false; redirectTo: string };

const PUBLIC_EXACT_ROUTES = ["/", "/login", "/register", "/terms", "/privacy"];

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
    return { allowed: false, redirectTo: "/login" };
  }

  return { allowed: true };
}
