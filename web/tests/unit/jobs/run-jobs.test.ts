// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { runJobs } from "@/lib/jobs/run-jobs";

describe("runJobs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs every job in order", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const order: string[] = [];
    await runJobs([
      { name: "first", run: async () => (order.push("first"), 1) },
      { name: "second", run: async () => (order.push("second"), 2) },
    ]);
    expect(order).toEqual(["first", "second"]);
  });

  it("logs how many rows each job removed", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await runJobs([{ name: "audit_log purge", run: async () => 3 }]);
    expect(info).toHaveBeenCalledWith("[jobs] audit_log purge: 3 removed");
  });

  it("a failing job does not stop the next ones, and its error goes to the log", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("disk full");
    const after = vi.fn(async () => 0);

    await runJobs([
      { name: "broken", run: async () => Promise.reject(failure) },
      { name: "after", run: after },
    ]);

    expect(after).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith("[jobs] broken failed:", failure);
  });
});
