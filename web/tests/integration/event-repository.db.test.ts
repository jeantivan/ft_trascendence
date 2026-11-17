// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { SpotRequestStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { PrismaEventRepository } from "@/lib/events/event-repository";
import {
  eventIdOf,
  runEventRepositoryContract,
  type NewSession,
} from "../support/event-repository-contract";

const PREFIX = "event-repository-";
const repository = new PrismaEventRepository(prisma);
let count = 0;

async function createClub(): Promise<string> {
  const club = await prisma.organization.create({
    // The name is unique: the prefix also lets afterEach find the club
    data: { name: `${PREFIX}${count++}`, timezone: "Europe/Madrid" },
  });
  return club.id;
}

// A real user who is a member of the club (created_by and memberships have foreign keys)
async function addMember(orgId: string, role: "manager" | "athlete"): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}${count++}@example.com`,
      memberships: { create: { orgId, role } },
    },
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
): Promise<void> {
  await prisma.spotRequest.create({ data: { eventId, userId, status } });
}

afterEach(async () => {
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
  addAthlete: (orgId) => addMember(orgId, "athlete"),
  addSession,
  addSpotRequest,
}));

// What the contract cannot see: the interface has no read for an Event's chat
describe("PrismaEventRepository.createEvent", () => {
  const NOW = new Date("2030-01-01T10:00:00.000Z");
  const DATA = {
    title: "Rodaje suave",
    location: "Parque del Retiro",
    startsAt: new Date("2030-01-02T10:00:00.000Z"),
    sessionId: null,
  };

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
