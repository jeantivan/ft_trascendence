import { describe, expect, it } from "vitest";
import type { SessionOrigin, SpotRequestStatus } from "@/generated/prisma/enums";
import type { CreateEventResult, EventData, EventRepository } from "@/lib/events/event-repository";

// A valid id that no Session has
const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

// A fixed "now", so no test depends on the clock
const NOW = new Date("2030-01-01T10:00:00.000Z");
const TOMORROW = new Date("2030-01-02T10:00:00.000Z");

// What each implementation gives the contract: the repository, and a way to put
// in it what the interface cannot create yet (a real database needs real rows)
export interface EventFixture {
  repo: EventRepository;
  // A new club, empty
  createClub(): Promise<string>;
  // A new user who is a Manager or an Athlete of that club; returns their id
  addManager(orgId: string): Promise<string>;
  addAthlete(orgId: string): Promise<string>;
  // A new Session of that club; returns its id. A group Session copied from a
  // Training Template has origin "template" and no athleteId
  addSession(orgId: string, session: NewSession): Promise<string>;
  // A Spot Request of that user in that Event, already in that status. The
  // interface cannot create one until #232
  addSpotRequest(eventId: string, userId: string, status: SpotRequestStatus): Promise<void>;
}

export interface NewSession {
  origin: SessionOrigin;
  // null: a group Session; set: a personal one (customized or free)
  athleteId: string | null;
}

function eventData(overrides: Partial<EventData> = {}): EventData {
  return {
    title: "Rodaje suave",
    location: "Parque del Retiro",
    startsAt: TOMORROW,
    sessionId: null,
    ...overrides,
  };
}

// The id of an Event that had to be created; fails the test if it was not.
// Exported for the tests that only run on Postgres
export function eventIdOf(result: CreateEventResult): string {
  if (!result.ok) {
    throw new Error(`createEvent failed: ${result.reason}`);
  }
  return result.eventId;
}

// Rules every EventRepository must follow
export function runEventRepositoryContract(name: string, createFixture: () => EventFixture) {
  describe(`EventRepository contract: ${name}`, () => {
    it("a created Event reads back for a member with no approved spots and no request of their own", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const data = eventData();

      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, data, NOW));
      const view = await repo.getEventForMember(orgId, eventId, athleteId);

      expect(view).toEqual({
        id: eventId,
        orgId,
        title: data.title,
        location: data.location,
        startsAt: data.startsAt,
        sessionId: null,
        cancelledAt: null,
        approvedCount: 0,
        mySpotRequest: null,
      });
    });

    it("an Event of another club reads as if it did not exist", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const athleteB = await addAthlete(orgB);
      const eventId = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));

      await expect(repo.getEventForMember(orgB, eventId, athleteB)).resolves.toBeNull();
    });

    it("createEvent rejects an Event that starts right now", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);

      // NOW and not yesterday: the limit. Starting at now already counts as started
      await expect(
        repo.createEvent(orgId, managerId, eventData({ startsAt: NOW }), NOW),
      ).resolves.toEqual({ ok: false, reason: "starts-in-the-past" });
    });

    it("createEvent rejects a Session of another club", async () => {
      const { repo, createClub, addManager, addSession } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      // A valid Session in every other way: only the club is wrong
      const sessionB = await addSession(orgB, { origin: "template", athleteId: null });

      await expect(
        repo.createEvent(orgA, managerA, eventData({ sessionId: sessionB }), NOW),
      ).resolves.toEqual({ ok: false, reason: "invalid-session" });
    });

    it("createEvent rejects a Session that does not come from a Training Template", async () => {
      const { repo, createClub, addManager, addSession } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      // athleteId null on purpose, so only the origin is wrong
      const sessionId = await addSession(orgId, { origin: "free", athleteId: null });

      await expect(
        repo.createEvent(orgId, managerId, eventData({ sessionId }), NOW),
      ).resolves.toEqual({ ok: false, reason: "invalid-session" });
    });

    it("createEvent rejects an Athlete's own Session, even one copied from a Training Template", async () => {
      const { repo, createClub, addManager, addAthlete, addSession } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      // origin "template" on purpose, so only the athleteId is wrong
      const sessionId = await addSession(orgId, { origin: "template", athleteId });

      await expect(
        repo.createEvent(orgId, managerId, eventData({ sessionId }), NOW),
      ).resolves.toEqual({ ok: false, reason: "invalid-session" });
    });

    it("createEvent rejects a Session that does not exist", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);

      await expect(
        repo.createEvent(orgId, managerId, eventData({ sessionId: UNKNOWN_ID }), NOW),
      ).resolves.toEqual({ ok: false, reason: "invalid-session" });
    });

    it("createEvent checks the start before the Session", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      // Both wrong: the first reason in the fixed order wins
      const data = eventData({ startsAt: NOW, sessionId: UNKNOWN_ID });

      await expect(repo.createEvent(orgId, managerId, data, NOW)).resolves.toEqual({
        ok: false,
        reason: "starts-in-the-past",
      });
    });

    it("createEvent links a group Session of a Training Template of the same club", async () => {
      const { repo, createClub, addManager, addAthlete, addSession } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const sessionId = await addSession(orgId, { origin: "template", athleteId: null });

      const eventId = eventIdOf(
        await repo.createEvent(orgId, managerId, eventData({ sessionId }), NOW),
      );

      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.sessionId).toBe(sessionId);
    });

    it("approvedCount counts only approved Spot Requests", async () => {
      const { repo, createClub, addManager, addAthlete, addSpotRequest } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      // One Athlete per status, approved twice: only those two count
      for (const status of ["pending", "approved", "approved", "rejected", "withdrawn"] as const) {
        await addSpotRequest(eventId, await addAthlete(orgId), status);
      }
      // A member without a Spot Request of their own
      const viewerId = await addAthlete(orgId);

      const view = await repo.getEventForMember(orgId, eventId, viewerId);

      expect(view).toMatchObject({ approvedCount: 2, mySpotRequest: null });
    });

    it("mySpotRequest is the status of the viewer's own Spot Request", async () => {
      const { repo, createClub, addManager, addAthlete, addSpotRequest } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      // pending and not approved: so it does not depend on approvedCount
      await addSpotRequest(eventId, athleteId, "pending");

      const view = await repo.getEventForMember(orgId, eventId, athleteId);

      expect(view?.mySpotRequest).toBe("pending");
    });

    it("Spot Requests of another Event do not count", async () => {
      const { repo, createClub, addManager, addAthlete, addSpotRequest } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventA = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      const eventB = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      // Approved, and by the viewer: it would show in both fields of the Event A
      await addSpotRequest(eventB, athleteId, "approved");

      const view = await repo.getEventForMember(orgId, eventA, athleteId);

      expect(view).toMatchObject({ approvedCount: 0, mySpotRequest: null });
    });
  });
}
