// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/notifications/route";
import { POST } from "@/app/api/notifications/[id]/read/route";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// The real requireApiAuth needs NextAuth: fake it and say who is signed in.
// The users are real rows, because notifications point at them (foreign key).
vi.mock("@/lib/permissions/require-api-auth", () => ({
  requireApiAuth: vi.fn(),
}));

const EMAIL_PREFIX = "notifications-api-test-";

async function signIn(name: string) {
  const user = await prisma.user.create({ data: { email: `${EMAIL_PREFIX}${name}@example.com` } });
  vi.mocked(requireApiAuth).mockResolvedValue({
    id: user.id,
    email: user.email,
    nick: name,
    roleGlobal: "user",
  });
  return user;
}

function signOut() {
  vi.mocked(requireApiAuth).mockResolvedValue(
    Response.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function createNotification(userId: string) {
  return prisma.notification.create({
    data: { userId, type: "contact_request", payload: { contactId: "a0000000-0000-4000-8000-000000000501" } },
  });
}

// Calls POST /api/notifications/<id>/read the way Next.js does
function markRead(id: string) {
  return POST(new Request(`http://localhost/api/notifications/${id}/read`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

describe("Integration: notifications API", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET answers 401 without a session", async () => {
    signOut();

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("GET lists the user's notifications with string ids", async () => {
    const ana = await signIn("ana");
    const notification = await createNotification(ana.id);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].id).toBe(notification.id.toString());
  });

  it("POST marks the user's own notification as read", async () => {
    const ana = await signIn("ana");
    const notification = await createNotification(ana.id);

    const response = await markRead(notification.id.toString());

    expect(response.status).toBe(204);
    const saved = await prisma.notification.findUnique({ where: { id: notification.id } });
    expect(saved?.readAt).not.toBe(null);
  });

  it("POST answers 404 and changes nothing for another user's notification", async () => {
    const ana = await signIn("ana");
    const notification = await createNotification(ana.id);
    await signIn("luis");

    const response = await markRead(notification.id.toString());

    expect(response.status).toBe(404);
    const saved = await prisma.notification.findUnique({ where: { id: notification.id } });
    expect(saved?.readAt).toBe(null);
  });

  // A 19-digit id may not fit in Postgres bigint: it must be a 404, not a 500
  it.each(["hola", "-1", "4.5", "1234567890123456789"])("POST answers 404 for the id %s", async (id: string) => {
    await signIn("ana");

    const response = await markRead(id);

    expect(response.status).toBe(404);
  });
});
