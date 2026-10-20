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

  const isPublic = PUBLIC_EXACT_ROUTES.includes(pathname);

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
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
