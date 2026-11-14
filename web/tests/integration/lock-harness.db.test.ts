import { describe, expect, it } from "vitest";
import { withLockHarness } from "../support/lock-harness";

// Smoke test of the harness itself, with plain SQL: advisory locks need no tables.
describe("LockHarness", () => {
  // Distinct per test so a failed run cannot leave the other test waiting
  const lockKeys = { waits: 910_001, noWait: 910_002 };

  it("proves that two operations wait behind the gate, and lets them finish once it is released", async () => {
    const key = lockKeys.waits;
    const finished: string[] = [];

    await withLockHarness(async (harness) => {
      const gate = await harness.holdLock("gate", (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`);
      const clientA = harness.client("a");
      const clientB = harness.client("b");
      const operationA = harness.track(
        clientA.db.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`.then(() => finished.push("a")),
      );
      const operationB = harness.track(
        clientB.db.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`.then(() => finished.push("b")),
      );

      const evidence = await harness.waitUntilWaiting(gate, [
        { name: "a", client: clientA, queryFragment: "pg_advisory_xact_lock" },
        { name: "b", client: clientB, queryFragment: "pg_advisory_xact_lock" },
      ]);

      // Three different sessions, and both operations are blocked by the gate
      expect(new Set([gate.pid, ...evidence.map((e) => e.pid)]).size).toBe(3);
      for (const e of evidence) {
        expect(e.waitEventType).toBe("Lock");
        expect(e.blockingChain).toContain(gate.pid);
      }
      // Waiting means waiting: nothing has finished before the release
      expect(finished).toEqual([]);

      gate.release();
      await Promise.all([operationA, operationB]);
    });

    expect([...finished].sort()).toEqual(["a", "b"]);
  });

  it("fails, saying what it saw, when an operation is not waiting for the gate", async () => {
    const key = lockKeys.noWait;

    await withLockHarness(async (harness) => {
      const gate = await harness.holdLock("gate", (tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`);
      // This operation takes a different lock, so it never waits behind the gate
      const client = harness.client("free");
      harness.track(client.db.$executeRaw`SELECT pg_advisory_xact_lock(${key + 1}::bigint)`);

      await expect(
        harness.waitUntilWaiting(gate, [{ name: "free", client, queryFragment: "pg_advisory_xact_lock" }], 300),
      ).rejects.toThrow(/Not every operation was waiting behind the gate/);
    });
  });
});
