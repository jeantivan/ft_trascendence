// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActionEntry } from "@/lib/audit/record-admin-action";

// audit_log has no foreign keys (schema.prisma), so these ids need no users
const ADMIN_ID = "a0000000-0000-4000-8000-000000000101";
const SUBJECT_ID = "a0000000-0000-4000-8000-000000000102";
const CLUB_ID = "a0000000-0000-4000-8000-000000000103";
const GROUP_ID = "a0000000-0000-4000-8000-000000000104";
const MESSAGE_ID = "a0000000-0000-4000-8000-000000000105";

const adminRows = () => prisma.auditLog.findMany({ where: { actorId: ADMIN_ID } });

describe("Integration: recordAdminAction", () => {
  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: ADMIN_ID } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("writes one row with actor_role admin, the ids, the action and the resource", async () => {
    await prisma.$transaction((tx) =>
      recordAdminAction(tx, { adminId: ADMIN_ID, action: "block", resource: "account", subjectId: SUBJECT_ID }),
    );

    const rows = await adminRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: ADMIN_ID,
      actorRole: "admin",
      action: "block",
      resource: "account",
      subjectId: SUBJECT_ID,
      resourceId: null,
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("leaves no row when the transaction fails after it", async () => {
    const failing = prisma.$transaction(async (tx) => {
      await recordAdminAction(tx, { adminId: ADMIN_ID, action: "delete", resource: "group", resourceId: GROUP_ID });
      throw new Error("the action itself failed");
    });

    await expect(failing).rejects.toThrow("the action itself failed");
    await expect(adminRows()).resolves.toEqual([]);
  });

  // On purpose it lists every column: a new one (e.g. a content field) must be a
  // conscious change, because the row is kept 12 months (Privacy Policy section 7)
  it("stores only ids, action, resource, role and date", async () => {
    await prisma.$transaction((tx) =>
      recordAdminAction(tx, { adminId: ADMIN_ID, action: "create", resource: "organization", resourceId: CLUB_ID }),
    );

    const [row] = await adminRows();
    expect(Object.keys(row).sort()).toEqual(
      ["action", "actorId", "actorRole", "createdAt", "id", "resource", "resourceId", "subjectId"].sort(),
    );
    expect(row).toMatchObject({ resourceId: CLUB_ID, subjectId: null });
  });

  // Every value the migration added, plus update (nick) and read (reported content).
  // read goes on a reported message, the only thing the Admin reads (matrix #2)
  it.each(ADMIN_AUDIT_ACTIONS)("saves the action %s", async (action) => {
    const entry: AdminActionEntry =
      action === "read"
        ? { adminId: ADMIN_ID, action, resource: "message", resourceId: MESSAGE_ID, subjectId: SUBJECT_ID }
        : { adminId: ADMIN_ID, action, resource: "account", subjectId: SUBJECT_ID };

    await prisma.$transaction((tx) => recordAdminAction(tx, entry));

    await expect(adminRows()).resolves.toMatchObject([{ action, resource: entry.resource }]);
  });

  it("does not compile an action about a person without subjectId, or an unknown resource", () => {
    // Checked by tsc: without subjectId the row would never reach the person's export (#36)
    // @ts-expect-error subjectId is required for account
    const account: AdminActionEntry = { adminId: ADMIN_ID, action: "block", resource: "account" };
    // @ts-expect-error subjectId is required for membership
    const membership: AdminActionEntry = { adminId: ADMIN_ID, action: "delete", resource: "membership" };
    // @ts-expect-error subjectId (the author) is required for message
    const message: AdminActionEntry = { adminId: ADMIN_ID, action: "read", resource: "message", resourceId: MESSAGE_ID };
    // @ts-expect-error resource must be one of the known ones
    const typo: AdminActionEntry = { adminId: ADMIN_ID, action: "delete", resource: "groups", resourceId: GROUP_ID };

    expect([account, membership, message, typo]).toHaveLength(4);
  });
});
