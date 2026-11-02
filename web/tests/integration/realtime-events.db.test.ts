// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/events/route";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/events/publish";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { closeListener } from "@/lib/events/listener";
// The real requireApiAuth needs NextAuth and the users table: fake it, so this test
// only checks the realtime path.
vi.mock("@/lib/permissions/require-api-auth", () => ({
  requireApiAuth: vi.fn(),
}));

const testUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "runner@example.com",
  nick: "runner",
  roleGlobal: "user" as const,
};

// Needs a real Postgres (LISTEN/NOTIFY): skipped locally without DATABASE_URL_TEST (#83),
// but CI must always run it, so a missing test database fails there.
const hasDatabase = Boolean(process.env.DATABASE_URL_TEST);
if (!hasDatabase && process.env.CI) {
  throw new Error("DATABASE_URL_TEST is required in CI for the realtime integration test");
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string) {
  const decoder = new TextDecoder();
  let received = "";
  while (!received.includes(expected)) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    received += decoder.decode(value);
  }
  return received;
}

describe.skipIf(!hasDatabase)("Integration: realtime events", () => {
  beforeEach(() => {
    vi.mocked(requireApiAuth).mockResolvedValue(testUser);
  });
  afterAll(async () => {
    await closeListener();
    await prisma.$disconnect();
  });

  it("delivers a published event to an open SSE stream", async () => {
    const response = await GET(new Request("http://localhost/api/events"));
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const body = response.body;
    if (!body) {
      throw new Error("the SSE response has no body");
    }
    const reader = body.getReader();
    await readUntil(reader, ": connected");
    await prisma.$transaction(async (tx) => {
      await publish(tx, "test", { id: "42" });
    });

    const received = await readUntil(reader, '{"id":"42"}');
    expect(received).toContain('event: test\ndata: {"id":"42"}');
    await reader.cancel();
  });
  it("does not deliver an event whose transaction rolls back", async () => {
    const response = await GET(new Request("http://localhost/api/events"));
    const body = response.body;
    if (!body) {
      throw new Error("the SSE response has no body");
    }
    const reader = body.getReader();
    await readUntil(reader, ": connected");

    await expect(
      prisma.$transaction(async (tx) => {
        await publish(tx, "test", { id: "rolled-back" });
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");

    // NOTIFYs arrive in commit order: if the rolled-back one had been sent,
    // it would show up before this one.
    await prisma.$transaction(async (tx) => {
      await publish(tx, "test", {id: "after" });
    });
    const received = await readUntil(reader, '{"id":"after"}');
    expect(received).not.toContain("rolled-back");

    await reader.cancel();
  });
  it("answers 401 without opening a stream when requireApiAuth rejects", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue(
      Response.json({ error: "Unauthorized" }, {status: 401 }),
    );

    const response = await GET(new Request("http://localhost/api/events"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).not.toBe("text/event-stream");
  });
});