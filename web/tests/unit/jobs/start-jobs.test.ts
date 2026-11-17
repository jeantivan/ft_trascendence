// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startJobs } from "@/lib/jobs/run-jobs";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("startJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs the jobs on start, then again every 24 hours", async () => {
    const run = vi.fn(async () => 0);
    const stop = startJobs([{ name: "job", run }]);

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DAY_MS - 1);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(DAY_MS);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it("stop() ends the daily runs", async () => {
    const run = vi.fn(async () => 0);
    const stop = startJobs([{ name: "job", run }]);
    await vi.advanceTimersByTimeAsync(0);

    stop();
    await vi.advanceTimersByTimeAsync(2 * DAY_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
