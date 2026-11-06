// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { deleteWithFreshOtp } from "../support/delete-account-helper";

// These tests delete rows, so they only run against a database whose name ends in _test
const url = process.env.DATABASE_URL_TEST;
const isTestDatabase = url !== undefined && new URL(url).pathname.endsWith("_test");

const USER_A = "77777777-7777-4777-8777-777777777771";
const USER_B = "77777777-7777-4777-8777-777777777772";

// Conversations and messages after an account is deleted (docs/gdpr/account-deletion-table.md).
// Plain participants only: what removed_at means for a deletion is still an open question.
describe.skipIf(!isTestDatabase)("borrado de cuenta: conversaciones y mensajes", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  let conversationId: string;
  let orgId: string | undefined;

  // Two participants, one message each
  async function seedConversation(kind: "dm" | "event") {
    let eventId: string | undefined;
    if (kind === "event") {
      const org = await db.organization.create({ data: { name: "conversations-club", timezone: "Europe/Madrid" } });
      orgId = org.id;
      const event = await db.event.create({
        data: { orgId: org.id, title: "Rodaje", location: "Retiro", startsAt: new Date("2030-01-01T10:00:00Z") },
      });
      eventId = event.id;
    }
    const conversation = await db.conversation.create({
      data: {
        kind,
        eventId,
        participants: { create: [{ userId: USER_A }, { userId: USER_B }] },
        messages: {
          create: [
            { authorId: USER_A, body: "mensaje de A" },
            { authorId: USER_B, body: "mensaje de B" },
          ],
        },
      },
    });
    conversationId = conversation.id;
  }

  const messages = () => db.message.findMany({ where: { conversationId }, orderBy: { id: "asc" } });

  beforeEach(async () => {
    for (const [id, email] of [
      [USER_A, "conversations-a@example.test"],
      [USER_B, "conversations-b@example.test"],
    ]) {
      await db.user.create({ data: { id, email } });
    }
  });

  afterEach(async () => {
    // Conversations first: a failing test may leave one behind, and it has no owner left to cascade from
    await db.conversation.deleteMany({ where: { id: conversationId } });
    await db.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
    orgId = undefined;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("DM: si A borra su cuenta y B permanece, la conversación sigue, los mensajes de A quedan sin autor y A deja de participar", async () => {
    await seedConversation("dm");

    expect(await deleteWithFreshOtp(USER_A, db)).toEqual({ deleted: true });

    expect(await db.conversation.count({ where: { id: conversationId } })).toBe(1);
    expect((await messages()).map((m) => [m.body, m.authorId])).toEqual([
      ["mensaje de A", null],
      ["mensaje de B", USER_B],
    ]);
    const participants = await db.conversationParticipant.findMany({ where: { conversationId } });
    expect(participants.map((p) => p.userId)).toEqual([USER_B]);
  });

  it("chat de Event: borrar a A no elimina la conversación ni sus mensajes, que quedan sin autor", async () => {
    await seedConversation("event");

    expect(await deleteWithFreshOtp(USER_A, db)).toEqual({ deleted: true });

    expect(await db.conversation.count({ where: { id: conversationId } })).toBe(1);
    expect((await messages()).map((m) => [m.body, m.authorId])).toEqual([
      ["mensaje de A", null],
      ["mensaje de B", USER_B],
    ]);
  });

  it("DM: cuando A y B han borrado sus cuentas, la conversación y sus mensajes desaparecen", async () => {
    await seedConversation("dm");

    await deleteWithFreshOtp(USER_A, db);
    await deleteWithFreshOtp(USER_B, db);

    expect(await db.conversation.count({ where: { id: conversationId } })).toBe(0);
    expect(await messages()).toEqual([]);
  });

  it("DM: si A y B borran sus cuentas a la vez, no queda una conversación vacía", async () => {
    // Several rounds: the race is only visible when the two transactions overlap
    for (let round = 0; round < 10; round++) {
      if (round > 0) {
        await db.user.createMany({
          data: [
            { id: USER_A, email: "conversations-a@example.test" },
            { id: USER_B, email: "conversations-b@example.test" },
          ],
        });
      }
      await seedConversation("dm");

      await Promise.all([deleteWithFreshOtp(USER_A, db), deleteWithFreshOtp(USER_B, db)]);

      expect(await db.conversation.count({ where: { id: conversationId } }), `round ${round}`).toBe(0);
      expect(await messages()).toEqual([]);
    }
  });

  it("DM: un participante con removed_at cuenta como presente (decisión provisional, pendiente de Jacobo)", async () => {
    await seedConversation("dm");
    await db.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: USER_B } },
      data: { removedAt: new Date() },
    });

    await deleteWithFreshOtp(USER_A, db);

    expect(await db.conversation.count({ where: { id: conversationId } })).toBe(1);
  });
});
