// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";

// Users created here share this prefix, so afterEach deletes only them
// (their notifications go too: onDelete Cascade)
const EMAIL_PREFIX = "notify-test-";

function createUser(name: string, notificationsEnabled: boolean) {
  return prisma.user.create({
    data: { email: `${EMAIL_PREFIX}${name}@example.com`, notificationsEnabled },
  });
}

const rowsOf = (userId: string) => prisma.notification.findMany({ where: { userId } });

describe("Integration: notify", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("saves the notification and returns its id when the user has them enabled", async () => {
    const user = await createUser("enabled", true);
    const payload = { contactId: "a0000000-0000-4000-8000-000000000201" };

    const id = await prisma.$transaction((tx) =>
      notify(tx, { userId: user.id, type: "contact_request", payload }),
    );

    const rows = await rowsOf(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, type: "contact_request", payload, readAt: null });
  });

  it("saves nothing and returns null when the user has them disabled", async () => {
    const user = await createUser("disabled", false);
    const payload = { contactId: "a0000000-0000-4000-8000-000000000201" };

    const id = await prisma.$transaction((tx) =>
      notify(tx, { userId: user.id, type: "contact_request", payload }),
    );

    const rows = await rowsOf(user.id);
    expect(id).toBe(null);
    expect(rows).toHaveLength(0);
  });

  it("saves a mandatory notification even when the user has them disabled", async () => {
    const user = await createUser("mandatory", false);
    const payload = { orgId: "a0000000-0000-4000-8000-000000000201" };

    const id = await prisma.$transaction((tx) =>
      notify(tx, { userId: user.id, type: "club_without_manager", payload }),
    );

    const rows = await rowsOf(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, type: "club_without_manager", payload, readAt: null });
  });

  it.each(["organization_deletion_scheduled", "organization_deletion_cancelled"])(
    "saves %s even when the user has notifications disabled",
    async (type) => {
      const user = await createUser(type, false);
      const payload = { orgId: "a0000000-0000-4000-8000-000000000201" };

      await prisma.$transaction((tx) => notify(tx, { userId: user.id, type, payload }));

      expect(await rowsOf(user.id)).toHaveLength(1);
    },
  );

  it("returns null for a mandatory notification when the user does not exist", async () => {
    const missingUserId = crypto.randomUUID();
    const payload = { orgId: "a0000000-0000-4000-8000-000000000201" };

    const id = await prisma.$transaction((tx) =>
      notify(tx, { userId: missingUserId, type: "club_without_manager", payload }),
    );

    expect(id).toBe(null);
  });

  it("throws and saves nothing when the payload is not only ids", async () => {
    const user = await createUser("badId", true);

    const failing = prisma.$transaction((tx) =>
      notify(tx, { userId: user.id, type: "contact_request", payload: { rpe: "7" } }),
    );

    await expect(failing).rejects.toThrow();
    const rows = await rowsOf(user.id);
    expect(rows).toHaveLength(0);
  });

  it("saves nothing when the transaction fails after notify", async () => {
    const user = await createUser("failure", true);
    const payload = { contactId: "a0000000-0000-4000-8000-000000000201" };

    const failing = prisma.$transaction(async (tx) => {
      await notify(tx, { userId: user.id, type: "contact_request", payload });
      throw new Error("the action itself failed");
    });

    await expect(failing).rejects.toThrow("the action itself failed");
    const rows = await rowsOf(user.id);
    expect(rows).toHaveLength(0);
  });
});
