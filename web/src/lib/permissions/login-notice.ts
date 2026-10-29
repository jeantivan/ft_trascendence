const BLOCKED_NOTICE =
  "Tu cuenta está bloqueada. Si crees que es un error, contacta con un administrador.";

// Only known codes map to our own text: the URL never decides what /login shows
export function loginNotice(error?: string): string | undefined {
  return error === "blocked" ? BLOCKED_NOTICE : undefined;
}
