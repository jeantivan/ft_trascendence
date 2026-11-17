// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock runs before the rest of the file, so its values are created with vi.hoisted
const { startJobs } = vi.hoisted(() => ({ startJobs: vi.fn() }));
vi.mock("@/lib/jobs/run-jobs", () => ({ startJobs }));
vi.mock("@/lib/jobs/jobs", () => ({ JOBS: [{ name: "fake", run: async () => 0 }] }));

import { register } from "@/instrumentation";

describe("instrumentation register()", () => {
  beforeEach(() => {
    startJobs.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts the jobs in the Node.js server", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await register();
    expect(startJobs).toHaveBeenCalledWith([expect.objectContaining({ name: "fake" })]);
  });

  it("does not start them in the edge runtime (register() also runs there)", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(startJobs).not.toHaveBeenCalled();
  });
});
