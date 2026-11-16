// Next.js calls register() once when the server starts (#224)
// It also runs in the edge runtime, which has no Prisma or timers to keep: the jobs
// only start in the Node.js server, and are imported here so edge never loads them
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startJobs } = await import("@/lib/jobs/run-jobs");
  const { JOBS } = await import("@/lib/jobs/jobs");
  startJobs(JOBS);
}
