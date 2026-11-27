function getNextDigest(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" ? digest : null;
  }
  return null;
}

/**
 * Translates thrown Server Action errors (403/404 HTTP fallbacks or network failures)
 * into user-facing messages, while letting Next.js redirect signals propagate.
 */
export function getTrainingActionError(error: unknown, fallback: string): string {
  const digest = getNextDigest(error);
  if (digest?.startsWith("NEXT_REDIRECT;")) {
    throw error;
  }
  if (digest === "NEXT_HTTP_ERROR_FALLBACK;403") {
    return "No tienes permisos para realizar esta acción en este club.";
  }
  if (digest === "NEXT_HTTP_ERROR_FALLBACK;404") {
    return "El recurso ya no existe o ha cambiado. Recarga la página e inténtalo de nuevo.";
  }
  return fallback;
}
