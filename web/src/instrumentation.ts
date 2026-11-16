// Runs once when the Next.js server starts (before it handles requests).
export async function register() {
  // The edge runtime has no filesystem or Prisma
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { cleanupInterruptedExports } = await import("@/lib/gdpr/export/cleanup-interrupted-exports");
  // A failed cleanup must not stop the server: the 15-minute rule in requestExport still applies
  await cleanupInterruptedExports().catch((error) => {
    console.warn(`Export cleanup failed (${error instanceof Error ? error.name : "unknown"})`);
  });
}
