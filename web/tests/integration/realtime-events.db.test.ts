// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/events/route";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime/publish";
import { notify } from "@/lib/notifications/notify";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { closeListener } from "@/lib/realtime/listener";
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
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000002";

// Needs a real Postgres (LISTEN/NOTIFY): the .db.test.ts name lets vitest.config.mts
// skip it without DATABASE_URL_TEST and fail in CI without it (#83).

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

describe("Integration: realtime events", () => {
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
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
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
      await publish(tx, "test", { id: "after" });
    });
    const received = await readUntil(reader, '{"id":"after"}');
    expect(received).not.toContain("rolled-back");

    await reader.cancel();
  });
  it("delivers a notification only to the stream of its user", async () => {
    const response = await GET(new Request("http://localhost/api/events"));
    const body = response.body;
    if (!body) {
      throw new Error("the SSE response has no body");
    }
    const reader = body.getReader();
    await readUntil(reader, ": connected");

    // publish() directly, not notify(): this checks the stream filter, and
    // testUser only exists in the requireApiAuth mock, not in the database
    await prisma.$transaction(async (tx) => {
      await publish(tx, "notification", { notificationId: "1", userId: OTHER_USER_ID });
    });
    // Commit order again: the other user's one would show up before this one
    await prisma.$transaction(async (tx) => {
      await publish(tx, "notification", { notificationId: "2", userId: testUser.id });
    });
    const received = await readUntil(reader, '"notificationId":"2"');

    expect(received).toContain('"notificationId":"2"');
    expect(received).not.toContain('"notificationId":"1"');

    await reader.cancel();
  });
  it("delivers what notify() publishes to the stream of its user", async () => {
    // notify() reads the user from the database, so the mock alone is not enough
    const user = await prisma.user.create({
      data: { email: "realtime-notify-test@example.com", notificationsEnabled: true },
    });
    vi.mocked(requireApiAuth).mockResolvedValue({ ...testUser, id: user.id });
    try {
      const response = await GET(new Request("http://localhost/api/events"));
      const body = response.body;
      if (!body) {
        throw new Error("the SSE response has no body");
      }
      const reader = body.getReader();
      await readUntil(reader, ": connected");

      const id = await prisma.$transaction((tx) =>
        notify(tx, { userId: user.id, type: "contact_request", payload: { contactId: OTHER_USER_ID } }),
      );
      expect(id).not.toBe(null);
      const received = await readUntil(reader, `"notificationId":"${id}"`);

      expect(received).toContain(`event: notification\ndata: {"notificationId":"${id}","userId":"${user.id}"}`);
      await reader.cancel();
    } finally {
      // Its notifications go too (onDelete Cascade)
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
  it("answers 401 without opening a stream when requireApiAuth rejects", async () => {
    vi.mocked(requireApiAuth).mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET(new Request("http://localhost/api/events"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).not.toBe("text/event-stream");
  });
});
