// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listOwnNotifications, markNotificationRead } from "@/lib/notifications/queries";

// Users created here share this prefix, so afterEach deletes only them
// (their notifications go too: onDelete Cascade)
const EMAIL_PREFIX = "notification-queries-test-";

function createUser(name: string) {
  return prisma.user.create({ data: { email: `${EMAIL_PREFIX}${name}@example.com` } });
}

function createNotification(userId: string) {
  return prisma.notification.create({
    data: { userId, type: "contact_request", payload: { contactId: "a0000000-0000-4000-8000-000000000401" } },
  });
}

describe("Integration: notification queries", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists only the user's own notifications, newest first", async () => {
    const ana = await createUser("ana");
    const luis = await createUser("luis");
    const older = await createNotification(ana.id);
    const newer = await createNotification(ana.id);
    await createNotification(luis.id);

    const list = await listOwnNotifications(ana.id);

    expect(list.map((notification) => notification.id)).toEqual([newer.id, older.id]);
  });

  it("marks the user's own notification as read", async () => {
    const ana = await createUser("ana");
    const notification = await createNotification(ana.id);

    const count = await markNotificationRead(ana.id, notification.id);

    expect(count).toBe(1);
  });

  it("does not mark another user's notification", async () => {
    const ana = await createUser("ana");
    const luis = await createUser("luis");
    const notification = await createNotification(ana.id);

    const count = await markNotificationRead(luis.id, notification.id);

    expect(count).toBe(0);
  });

  it("still counts the notification when it is already read", async () => {
    const ana = await createUser("ana");
    const notification = await createNotification(ana.id);

    await markNotificationRead(ana.id, notification.id);
    const count = await markNotificationRead(ana.id, notification.id);

    expect(count).toBe(1);
  });

});
