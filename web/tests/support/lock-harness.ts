import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { resolveTestDatabaseUrl } from "./test-database-url";

// Prisma's interactive transactions time out after 5 s by default (lock waits included;
// Postgres itself sets no limit). The observation deadline is shorter to leave margin, but
// it does not guarantee failing first: the two clocks do not start at the same moment.
const OBSERVE_DEADLINE_MS = 3_000;
const POLL_MS = 20;
const GATE_TIMEOUT_MS = 20_000;
// Limits of the harness' own clients (no other client is affected). They bound single
// SQL statements and Prisma transactions, nothing more: they do not bound password
// hashing, JavaScript promises, connecting, or a whole operation made of several steps.
// - an observation query is cancelled by Postgres after OBSERVE_QUERY_TIMEOUT_MS
// - a statement of an operation or of G is cancelled after STATEMENT_TIMEOUT_MS; time spent
//   waiting for a lock counts as statement time
// - an interactive transaction expires after the Prisma default (5 s) unless the client was
//   created with its own transactionTimeoutMs
const OBSERVE_QUERY_TIMEOUT_MS = 2_000;
const STATEMENT_TIMEOUT_MS = 10_000;

export interface ClientOptions {
  statementTimeoutMs?: number;
  // For an operation that has to wait behind G while the test prepares the next operation
  transactionTimeoutMs?: number;
}

// A Prisma client with a pool of one connection and its own application_name, so its
// backend can be told apart in pg_stat_activity from every other session of the test database
export interface HarnessClient {
  db: PrismaClient;
  applicationName: string;
}

// A transaction G the test holds open, with a lock the operations will queue behind
export interface Gate {
  pid: number;
  applicationName: string;
  release(): void;
  // Set if G's transaction failed on its own (not because the test released it)
  failure(): { error: unknown } | undefined;
}

// What close() needs to finish G: release it, then collect how its transaction ended
interface HeldGate {
  release(): void;
  done: Promise<void>;
}

// An operation that must be waiting for a lock, and the query it must be stopped at
export interface WaitTarget {
  name: string;
  client: HarnessClient;
  queryFragment: string;
}

export interface WaitEvidence {
  name: string;
  pid: number;
  waitEventType: string | null;
  query: string;
  // Every pid the operation waits for, directly or through other waiting sessions
  blockingChain: number[];
}

interface Backend {
  pid: number;
  application_name: string;
  state: string | null;
  wait_event_type: string | null;
  wait_event: string | null;
  query: string;
  blockers: number[];
}

function blockingChain(backends: Map<number, Backend>, start: number): number[] {
  const seen = new Set<number>();
  const pending = [...(backends.get(start)?.blockers ?? [])];
  while (pending.length > 0) {
    const pid = pending.pop() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    pending.push(...(backends.get(pid)?.blockers ?? []));
  }
  return [...seen];
}

// Forces a concurrent interleaving in the test database: G holds a lock, the operations
// start and queue behind it, the harness proves where each one is stopped, and then G is
// released. Use it through withLockHarness, which always cleans up.
export class LockHarness {
  private readonly url: string;
  private readonly clients: PrismaClient[] = [];
  private readonly gates: HeldGate[] = [];
  private readonly started: Promise<unknown>[] = [];
  // Its own connection: it only reads pg_stat_activity, and Postgres cancels its queries
  private observer: PrismaClient | undefined;

  constructor() {
    // Same safeguard as vitest.config.mts: only a database ending in _test
    const url = resolveTestDatabaseUrl(process.env);
    if (url === null) throw new Error("LockHarness needs DATABASE_URL_TEST");
    this.url = url;
  }

  client(label: string, options: ClientOptions = {}): HarnessClient {
    const applicationName = `harness-${label}-${randomUUID().slice(0, 8)}`;
    const adapter = new PrismaPg({
      connectionString: this.url,
      application_name: applicationName,
      statement_timeout: options.statementTimeoutMs ?? STATEMENT_TIMEOUT_MS,
      max: 1,
    });
    const db = new PrismaClient({
      adapter,
      ...(options.transactionTimeoutMs && { transactionOptions: { timeout: options.transactionTimeoutMs } }),
    });
    this.clients.push(db);
    return { db, applicationName };
  }

  // Registers an operation so close() waits for it even if the test fails halfway. The
  // same promise comes back; a rejection the test has not looked at yet is not "unhandled".
  // How an operation ends (including a domain error) is for the test to judge, not close().
  track<T>(operation: Promise<T>): Promise<T> {
    this.started.push(operation);
    operation.catch(() => {});
    return operation;
  }

  // Opens G: runs lock(tx) in a transaction and keeps it open until release(). Resolves
  // when G holds the lock. If G's transaction fails, before or after that, the failure
  // reaches the test: through this call, gate.failure() or close().
  async holdLock(
    label: string,
    lock: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<Gate> {
    const { db, applicationName } = this.client(label);
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let reportPid!: (pid: number) => void;
    const ready = new Promise<number>((resolve) => (reportPid = resolve));

    // "G is ready" (ready) and "G has ended" (done) are separate signals
    const done = db.$transaction(
      async (tx) => {
        await lock(tx);
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        reportPid(pid);
        await released;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: GATE_TIMEOUT_MS },
    );
    let failure: { error: unknown } | undefined;
    done.catch((error) => {
      failure = { error };
    });
    this.gates.push({ release, done });

    // If G fails before it is ready, that error is what the caller gets
    const pid = await Promise.race([
      ready,
      done.then(() => {
        throw new Error(`Gate "${label}" ended before holding its lock`);
      }),
    ]);
    return { pid, applicationName, release, failure: () => failure };
  }

  private async snapshot(): Promise<Map<number, Backend>> {
    this.observer ??= this.client("observer", { statementTimeoutMs: OBSERVE_QUERY_TIMEOUT_MS }).db;
    const rows = await this.observer.$queryRaw<Backend[]>`
      SELECT pid, application_name, state, wait_event_type, wait_event, query, pg_blocking_pids(pid)::int[] AS blockers
      FROM pg_stat_activity
      WHERE datname = current_database()`;
    return new Map(rows.map((row) => [row.pid, { ...row, blockers: row.blockers.map(Number) }]));
  }

  // Polls until every target is, in one same snapshot: the only backend of its own client,
  // waiting for a lock, stopped at its expected query, with G in its blocking chain.
  // Fails with what the last snapshot showed if that does not happen before deadlineMs
  // (checked between snapshots; a snapshot in flight is cancelled by Postgres after
  // OBSERVE_QUERY_TIMEOUT_MS). Keep the default unless an operation does real work (for
  // example hashing) before it reaches its lock, and say why where you pass another value.
  async waitUntilWaiting(
    gate: Gate,
    targets: WaitTarget[],
    deadlineMs = OBSERVE_DEADLINE_MS,
  ): Promise<WaitEvidence[]> {
    const deadline = Date.now() + deadlineMs;
    let lastSeen: string[] = [];
    let lastGateSeen = "gate: no snapshot taken";
    while (Date.now() < deadline) {
      const backends = await this.snapshot();
      const gateBackend = backends.get(gate.pid);
      lastGateSeen = `gate: pid ${gate.pid}, state ${gateBackend?.state}, wait ${gateBackend?.wait_event_type}/${gateBackend?.wait_event}`;
      const gateFailure = gate.failure();
      if (gateFailure) throw gateFailure.error;
      if (backends.get(gate.pid)?.application_name !== gate.applicationName) {
        throw new Error(`Backend ${gate.pid} is not the gate "${gate.applicationName}"`);
      }
      const evidence: WaitEvidence[] = [];
      lastSeen = [];
      for (const target of targets) {
        const own = [...backends.values()].filter(
          (b) => b.application_name === target.client.applicationName,
        );
        if (own.length !== 1) {
          lastSeen.push(`${target.name}: ${own.length} backends`);
          continue;
        }
        const [backend] = own;
        const chain = blockingChain(backends, backend.pid);
        // Only the sessions of this case; a query text has placeholders, not values
        lastSeen.push(
          `${target.name}: pid ${backend.pid}, state ${backend.state}, wait ${backend.wait_event_type}/${backend.wait_event}, blockers [${backend.blockers}], chain [${chain}], query "${backend.query.slice(0, 200)}"`,
        );
        if (
          backend.wait_event_type === "Lock" &&
          backend.query.includes(target.queryFragment) &&
          chain.includes(gate.pid)
        ) {
          evidence.push({
            name: target.name,
            pid: backend.pid,
            waitEventType: backend.wait_event_type,
            query: backend.query,
            blockingChain: chain,
          });
        }
      }
      if (evidence.length === targets.length) {
        if (process.env.HARNESS_EVIDENCE) {
          console.info(`gate pid ${gate.pid}\n${JSON.stringify(evidence, null, 2)}`);
        }
        return evidence;
      }
      await sleep(POLL_MS);
    }
    // The last snapshot, not a new query: no extra work after the deadline
    throw new Error(
      `Not every operation was waiting behind the gate (pid ${gate.pid}) within ${deadlineMs} ms:\n${lastGateSeen}\n${lastSeen.join("\n")}`,
    );
  }

  // Releases every gate, waits for every operation that was started, waits for G to end and
  // disconnects the harness' own clients, in that order. There is no overall time limit: an
  // operation that never settles (outside what the limits above cover) keeps close() waiting.
  // A failure of G or of a disconnect is not swallowed: it is thrown, in an AggregateError,
  // after the steps have run. How the operations ended is not reported: that is for each
  // test to assert.
  async close(): Promise<void> {
    const errors: unknown[] = [];
    for (const gate of this.gates) gate.release();
    await Promise.allSettled(this.started);
    for (const gate of this.gates) {
      try {
        await gate.done;
      } catch (error) {
        errors.push(error);
      }
    }
    const disconnects = await Promise.allSettled(
      this.clients.map((db) => db.$disconnect()),
    );
    for (const result of disconnects) {
      if (result.status === "rejected") errors.push(result.reason);
    }
    if (errors.length > 0) throw new AggregateError(errors, "LockHarness cleanup failed");
  }
}

// Runs body and always cleans up. The error of body, if any, is the one thrown; if the
// cleanup also failed, both are thrown together in an AggregateError.
export async function withLockHarness<T>(body: (harness: LockHarness) => Promise<T>): Promise<T> {
  const harness = new LockHarness();
  let outcome: { value: T } | { error: unknown };
  try {
    outcome = { value: await body(harness) };
  } catch (error) {
    outcome = { error };
  }
  let cleanupErrors: unknown[] = [];
  try {
    await harness.close();
  } catch (error) {
    cleanupErrors = error instanceof AggregateError ? error.errors : [error];
  }
  if ("error" in outcome) {
    if (cleanupErrors.length === 0) throw outcome.error;
    const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
    throw new AggregateError(
      [outcome.error, ...cleanupErrors],
      `${message} (and the harness cleanup failed too)`,
    );
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "LockHarness cleanup failed");
  return outcome.value;
}
