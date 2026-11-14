const DAY_MS = 24 * 60 * 60 * 1000;

// A periodic cleanup (#224): its name for the log, and run() returns how many rows
// or files it removed
export type Job = {
  name: string;
  run: () => Promise<number>;
};

// Runs the jobs one after another. A job that fails only logs its error: the next
// ones still run, so one broken cleanup does not stop the others
export async function runJobs(jobs: readonly Job[]): Promise<void> {
  for (const job of jobs) {
    try {
      const removed = await job.run();
      console.info(`[jobs] ${job.name}: ${removed} removed`);
    } catch (error) {
      console.error(`[jobs] ${job.name} failed:`, error);
    }
  }
}

// Runs the jobs once now and then every 24 hours (#224)
// Returns stop(), which ends the daily runs (used by the tests)
export function startJobs(jobs: readonly Job[]): () => void {
  void runJobs(jobs);
  const timer = setInterval(() => void runJobs(jobs), DAY_MS);
  // The timer alone must not keep the Node process alive
  timer.unref();
  return () => clearInterval(timer);
}
