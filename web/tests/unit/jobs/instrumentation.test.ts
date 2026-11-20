// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock runs before the rest of the file, so its values are created with vi.hoisted
const { startJobs, cleanupInterruptedExports } = vi.hoisted(() => ({
  startJobs: vi.fn(),
  cleanupInterruptedExports: vi.fn(async () => {}),
}));
vi.mock("@/lib/jobs/run-jobs", () => ({ startJobs }));
vi.mock("@/lib/jobs/jobs", () => ({ JOBS: [{ name: "fake", run: async () => 0 }] }));
vi.mock("@/lib/gdpr/export/cleanup-interrupted-exports", () => ({ cleanupInterruptedExports }));

import { register } from "@/instrumentation";

describe("instrumentation register()", () => {
  beforeEach(() => {
    startJobs.mockClear();
    cleanupInterruptedExports.mockReset();
    cleanupInterruptedExports.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts the jobs in the Node.js server", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(startJobs).toHaveBeenCalledWith([expect.objectContaining({ name: "fake" })]);
  });

  it("cleans up the interrupted exports once on start, before the jobs", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(cleanupInterruptedExports).toHaveBeenCalledTimes(1);
    expect(cleanupInterruptedExports.mock.invocationCallOrder[0]).toBeLessThan(
      startJobs.mock.invocationCallOrder[0],
    );
  });

  it("still starts the jobs when the export cleanup fails", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cleanupInterruptedExports.mockRejectedValue(new Error("db down"));
    await register();
    expect(startJobs).toHaveBeenCalledTimes(1);
  });

  it("does not start them in the edge runtime (register() also runs there)", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(startJobs).not.toHaveBeenCalled();
    expect(cleanupInterruptedExports).not.toHaveBeenCalled();
  });
});
