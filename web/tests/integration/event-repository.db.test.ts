// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import type { SpotRequestStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/gdpr/record-admin-action";
import { PrismaEventRepository } from "@/lib/events/event-repository";
import {
  eventIdOf,
  runEventRepositoryContract,
  type NewSession,
} from "../support/event-repository-contract";

// Delegates to the real function; a test replaces it once to make the audit
// write fail, as in organization-repository.db.test.ts
vi.mock("@/lib/gdpr/record-admin-action", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gdpr/record-admin-action")>();
  return { ...actual, recordAdminAction: vi.fn(actual.recordAdminAction) };
});

const PREFIX = "event-repository-";
// For the tests of this file outside the contract
const NOW = new Date("2030-01-01T10:00:00.000Z");
const DATA = {
  title: "Rodaje suave",
  location: "Parque del Retiro",
  startsAt: new Date("2030-01-02T10:00:00.000Z"),
  sessionId: null,
};
const repository = new PrismaEventRepository(prisma);
let count = 0;

async function createClub(): Promise<string> {
  const club = await prisma.organization.create({
    // The name is unique: the prefix also lets afterEach find the club
    data: { name: `${PREFIX}${count++}`, timezone: "Europe/Madrid" },
  });
  return club.id;
}

// A real user who is a member of the club (created_by and memberships have foreign keys).
// Without a nick, nick stays null in the database
async function addMember(
  orgId: string,
  role: "manager" | "athlete",
  nick?: string,
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}${count++}@example.com`,
      nick,
      memberships: { create: { orgId, role } },
    },
  });
  return user.id;
}

// A real Admin: a user with the global role, member of no club
async function addAdmin(): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${PREFIX}${count++}@example.com`, roleGlobal: "admin" },
  });
  return user.id;
}

// A real Session of the club. Type and date are fixed: no rule of the Event looks at them
async function addSession(orgId: string, session: NewSession): Promise<string> {
  const created = await prisma.trainingSession.create({
    data: {
      orgId,
      origin: session.origin,
      athleteId: session.athleteId,
      sessionType: "rodaje",
      scheduledAt: new Date("2030-01-02T10:00:00.000Z"),
    },
  });
  return created.id;
}

// A real row in spot_requests: event_id and user_id must exist (foreign keys).
// The club's deletion in afterEach removes it too (Event → Cascade)
async function addSpotRequest(
  eventId: string,
  userId: string,
  status: SpotRequestStatus,
  createdAt?: Date,
): Promise<void> {
  // createdAt undefined: Prisma leaves it out and Postgres puts now() (@default)
  await prisma.spotRequest.create({ data: { eventId, userId, status, createdAt } });
}

afterEach(async () => {
  // A mockImplementationOnce that no call used must not reach the next test:
  // mockReset drops it and goes back to the real recordAdminAction
  vi.mocked(recordAdminAction).mockReset();
  // audit_log has no foreign key to users: its rows stay behind unless deleted by actor
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users.map((user) => user.id) } } });
  // Sessions first: a club that has them cannot be deleted (onDelete: Restrict)
  await prisma.trainingSession.deleteMany({
    where: { organization: { name: { startsWith: PREFIX } } },
  });
  // Deleting the club also deletes its Events and memberships (onDelete: Cascade)
  await prisma.organization.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

runEventRepositoryContract("Prisma", () => ({
  repo: repository,
  createClub,
  addManager: (orgId) => addMember(orgId, "manager"),
  addAthlete: (orgId, nick) => addMember(orgId, "athlete", nick),
  addSession,
  addSpotRequest,
}));

// What the contract cannot see: the interface has no read for an Event's chat
describe("PrismaEventRepository.createEvent", () => {
  it("creates the Event with exactly one chat of kind event", async () => {
    const orgId = await createClub();
    const managerId = await addMember(orgId, "manager");

    const eventId = eventIdOf(await repository.createEvent(orgId, managerId, DATA, NOW));

    const chats = await prisma.conversation.findMany({ where: { eventId }, select: { kind: true } });
    expect(chats).toEqual([{ kind: "event" }]);
  });

  it("leaves no Event if its chat cannot be created", async () => {
    // Only this club's chats are rejected: other test files run at the same time
    // on the same database and must not see the trigger
    const club = await prisma.organization.create({
      data: { name: `${PREFIX}reject-chat`, timezone: "Europe/Madrid" },
    });
    const managerId = await addMember(club.id, "manager");
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION test_reject_event_chat() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM events e JOIN organizations o ON o.id = e.org_id
          WHERE e.id = NEW.event_id AND o.name = '${PREFIX}reject-chat'
        ) THEN
          RAISE EXCEPTION 'test: chat rejected';
        END IF;
        RETURN NEW;
      END $$`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_reject_event_chat BEFORE INSERT ON conversations
      FOR EACH ROW EXECUTE FUNCTION test_reject_event_chat()`);

    try {
      await expect(repository.createEvent(club.id, managerId, DATA, NOW)).rejects.toThrow(
        "test: chat rejected",
      );
      await expect(prisma.event.count({ where: { orgId: club.id } })).resolves.toBe(0);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS test_reject_event_chat ON conversations");
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS test_reject_event_chat()");
    }
  });
});

// What the contract cannot see: the interface has no read for audit_log
describe("PrismaEventRepository.deleteEvent", () => {
  it("the Admin's deletion writes one audit row, with ids only", async () => {
    const orgId = await createClub();
    const managerId = await addMember(orgId, "manager");
    const adminId = await addAdmin();
    const eventId = eventIdOf(await repository.createEvent(orgId, managerId, DATA, NOW));

    const result = await repository.deleteEvent(orgId, eventId, { kind: "admin", adminId });

    expect(result).toEqual({ ok: true });
    const rows = await prisma.auditLog.findMany({
      where: { actorId: adminId },
      select: { actorRole: true, action: true, resource: true, resourceId: true, subjectId: true },
    });
    // No subjectId: an Event is not a person, so the row reaches no one's export
    expect(rows).toEqual([
      { actorRole: "admin", action: "delete", resource: "event", resourceId: eventId, subjectId: null },
    ]);
  });

  it("a Manager's deletion writes no audit row", async () => {
    const orgId = await createClub();
    const managerId = await addMember(orgId, "manager");
    const eventId = eventIdOf(await repository.createEvent(orgId, managerId, DATA, NOW));

    await repository.deleteEvent(orgId, eventId, { kind: "manager" });

    // The Manager's audit is #163
    await expect(
      prisma.auditLog.count({ where: { resource: "event", resourceId: eventId } }),
    ).resolves.toBe(0);
  });

  it("if the audit write fails, the Event is not deleted", async () => {
    const orgId = await createClub();
    const managerId = await addMember(orgId, "manager");
    const adminId = await addAdmin();
    const eventId = eventIdOf(await repository.createEvent(orgId, managerId, DATA, NOW));
    // What the transaction saw when the audit was written
    const seen: { eventsInTx: number | null } = { eventsInTx: null };
    vi.mocked(recordAdminAction).mockImplementationOnce(async (tx: Prisma.TransactionClient) => {
      seen.eventsInTx = await tx.event.count({ where: { id: eventId } });
      throw new Error("audit write failed");
    });

    await expect(
      repository.deleteEvent(orgId, eventId, { kind: "admin", adminId }),
    ).rejects.toThrow("audit write failed");

    // Inside the transaction the Event was already gone: the rollback brought it back
    expect(seen.eventsInTx).toBe(0);
    await expect(prisma.event.count({ where: { id: eventId } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { actorId: adminId } })).resolves.toBe(0);
  });

  it("the Admin's deletion of an Event of another club is not-found and writes no audit row", async () => {
    const orgA = await createClub();
    const orgB = await createClub();
    const managerA = await addMember(orgA, "manager");
    const adminId = await addAdmin();
    const eventId = eventIdOf(await repository.createEvent(orgA, managerA, DATA, NOW));

    const result = await repository.deleteEvent(orgB, eventId, { kind: "admin", adminId });

    // A deletion that did not happen is not audited
    expect(result).toEqual({ ok: false, reason: "not-found" });
    await expect(prisma.auditLog.count({ where: { actorId: adminId } })).resolves.toBe(0);
    await expect(prisma.event.count({ where: { id: eventId } })).resolves.toBe(1);
  });

  // Invented text: Feedback is health data and real text never goes in a test
  const FEEDBACK_BODY = "feedback de prueba";

  // An Event with everything that hangs from it: a Spot Request, a Feedback and
  // one message in its chat. Then the Manager deletes it
  async function deleteEventWithDependents() {
    const orgId = await createClub();
    const managerId = await addMember(orgId, "manager");
    const athleteId = await addMember(orgId, "athlete");
    const eventId = eventIdOf(await repository.createEvent(orgId, managerId, DATA, NOW));
    await addSpotRequest(eventId, athleteId, "approved");
    const feedback = await prisma.feedback.create({
      data: { eventId, athleteId, managerId, body: FEEDBACK_BODY },
    });
    const chat = await prisma.conversation.findUniqueOrThrow({ where: { eventId } });
    await prisma.message.create({ data: { conversationId: chat.id, authorId: managerId, body: "hola" } });

    await repository.deleteEvent(orgId, eventId, { kind: "manager" });

    return { eventId, chatId: chat.id, feedbackId: feedback.id };
  }

  it("deleting an Event deletes its chat and the chat's messages", async () => {
    const { chatId } = await deleteEventWithDependents();

    await expect(prisma.conversation.count({ where: { id: chatId } })).resolves.toBe(0);
    await expect(prisma.message.count({ where: { conversationId: chatId } })).resolves.toBe(0);
  });

  it("deleting an Event deletes its Spot Requests", async () => {
    const { eventId } = await deleteEventWithDependents();

    await expect(prisma.spotRequest.count({ where: { eventId } })).resolves.toBe(0);
  });

  it("deleting an Event keeps its Feedback, with the same body and no Event", async () => {
    const { feedbackId } = await deleteEventWithDependents();

    // The Athlete keeps their history (schema: onDelete SetNull)
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { body: true, eventId: true },
    });
    expect(feedback).toEqual({ body: FEEDBACK_BODY, eventId: null });
  });
});
