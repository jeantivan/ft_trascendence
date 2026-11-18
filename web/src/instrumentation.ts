// Next.js calls register() once when the server starts (#224)
// It also runs in the edge runtime, which has no Prisma or timers to keep: the jobs
// only start in the Node.js server, and are imported here so edge never loads them
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Only on start, not in JOBS: it treats every pending export as interrupted,
  // so running it every 24 hours would fail exports still being generated
  const { cleanupInterruptedExports } = await import("@/lib/gdpr/export/cleanup-interrupted-exports");
  // A failed cleanup must not stop the server: the 15-minute rule in requestExport still applies
  await cleanupInterruptedExports().catch((error) => {
    console.warn(`Export cleanup failed (${error instanceof Error ? error.name : "unknown"})`);
  });

  const { startJobs } = await import("@/lib/jobs/run-jobs");
  const { JOBS } = await import("@/lib/jobs/jobs");
  startJobs(JOBS);
}
