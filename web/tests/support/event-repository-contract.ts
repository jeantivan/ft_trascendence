import { describe, expect, it } from "vitest";
import type { SessionOrigin, SpotRequestStatus } from "@/generated/prisma/enums";
import type {
  CreateEventResult,
  DeleteEventActor,
  EventData,
  EventRepository,
} from "@/lib/events/event-repository";

// A valid id that no Session or Event has
const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";

// A fixed "now", so no test depends on the clock
const NOW = new Date("2030-01-01T10:00:00.000Z");
const TOMORROW = new Date("2030-01-02T10:00:00.000Z");
// Later the same day, and the end of that day: for the lists
const TOMORROW_LATE = new Date("2030-01-02T18:00:00.000Z");
const TOMORROW_END = new Date("2030-01-03T00:00:00.000Z");
// Two moments to cancel at, after NOW and before TOMORROW: not NOW, so the test
// shows cancelledAt comes from the parameter
const CANCEL_AT = new Date("2030-01-01T12:00:00.000Z");
const CANCEL_AGAIN_AT = new Date("2030-01-01T15:00:00.000Z");
// The actor of the contract's deletions. The Admin is audited, and only Prisma
// writes audit rows: its tests are in event-repository.db.test.ts
const MANAGER: DeleteEventActor = { kind: "manager" };

// What each implementation gives the contract: the repository, and a way to put
// in it what the interface cannot create yet (a real database needs real rows)
export interface EventFixture {
  repo: EventRepository;
  // A new club, empty
  createClub(): Promise<string>;
  // A new user who is a Manager or an Athlete of that club; returns their id.
  // Without a nick, the user has none (nick is optional in users)
  addManager(orgId: string): Promise<string>;
  addAthlete(orgId: string, nick?: string): Promise<string>;
  // A new Session of that club; returns its id. A Template Session of the Group
  // has origin "template" and no athleteId
  addSession(orgId: string, session: NewSession): Promise<string>;
  // A Spot Request of that user in that Event, already in that status. The
  // interface cannot create one until #232. createdAt fixes the order of the
  // Manager's list; without it, the moment of the call
  addSpotRequest(
    eventId: string,
    userId: string,
    status: SpotRequestStatus,
    createdAt?: Date,
  ): Promise<void>;
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

    it("createEvent links a Template Session of the Group of the same club", async () => {
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

    it("the Manager's view lists every Spot Request with its nick, oldest first", async () => {
      const { repo, createClub, addManager, addAthlete, addSpotRequest } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const ana = await addAthlete(orgId, "Ana");
      const bruno = await addAthlete(orgId, "Bruno");
      const carla = await addAthlete(orgId, "Carla");
      const data = eventData();
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, data, NOW));
      const first = new Date("2029-12-30T10:00:00.000Z");
      const second = new Date("2029-12-30T11:00:00.000Z");
      const third = new Date("2029-12-30T12:00:00.000Z");
      // Added out of order on purpose: the order must come from createdAt
      await addSpotRequest(eventId, bruno, "approved", second);
      await addSpotRequest(eventId, carla, "rejected", third);
      await addSpotRequest(eventId, ana, "pending", first);

      // toEqual and not toMatchObject: no mySpotRequest, a Manager has none
      await expect(repo.getEventForManager(orgId, eventId)).resolves.toEqual({
        id: eventId,
        orgId,
        title: data.title,
        location: data.location,
        startsAt: data.startsAt,
        sessionId: null,
        cancelledAt: null,
        approvedCount: 1,
        spotRequests: [
          { athleteId: ana, nick: "Ana", status: "pending", createdAt: first },
          { athleteId: bruno, nick: "Bruno", status: "approved", createdAt: second },
          { athleteId: carla, nick: "Carla", status: "rejected", createdAt: third },
        ],
      });
    });

    it("the Manager's view shows an empty nick for a user without one", async () => {
      const { repo, createClub, addManager, addAthlete, addSpotRequest } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      // No nick: null in users, as in an OAuth account before #20 fills it
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await addSpotRequest(eventId, athleteId, "pending");

      const view = await repo.getEventForManager(orgId, eventId);

      expect(view?.spotRequests[0]?.nick).toBe("");
    });

    it("the Manager's view of an Event of another club is null", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const eventId = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));

      await expect(repo.getEventForManager(orgB, eventId)).resolves.toBeNull();
    });

    it("the Manager's view of an Event without Spot Requests has an empty list", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      const view = await repo.getEventForManager(orgId, eventId);

      expect(view).toMatchObject({ approvedCount: 0, spotRequests: [] });
    });

    it("listEvents returns the Events of [from, to), ordered by startsAt", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const viewerId = await addAthlete(orgId);
      const from = new Date("2030-01-05T00:00:00.000Z");
      const to = new Date("2030-01-12T00:00:00.000Z");
      // Created out of order on purpose: the order must come from startsAt
      const create = async (startsAt: Date) =>
        eventIdOf(await repo.createEvent(orgId, managerId, eventData({ startsAt }), NOW));
      const middle = await create(new Date("2030-01-08T18:00:00.000Z"));
      await create(to); // right at to: left out
      const atFrom = await create(from); // right at from: included
      await create(new Date("2030-01-04T23:59:00.000Z")); // just before from

      const list = await repo.listEvents(orgId, viewerId, { from, to });

      expect(list.map((event) => event.id)).toEqual([atFrom, middle]);
    });

    it("listEvents leaves out the Events of another club", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const managerB = await addManager(orgB);
      const viewerA = await addAthlete(orgA);
      // Same time for both: only the club tells them apart
      const eventA = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));
      await repo.createEvent(orgB, managerB, eventData(), NOW);

      const list = await repo.listEvents(orgA, viewerA, { from: NOW, to: TOMORROW_END });

      // The ids and not just the length: the stub [] must not pass
      expect(list.map((event) => event.id)).toEqual([eventA]);
    });

    it("each listed Event has its own approvedCount and mySpotRequest", async () => {
      const { repo, createClub, addManager, addAthlete, addSpotRequest } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const viewerId = await addAthlete(orgId);
      const early = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      const late = eventIdOf(
        await repo.createEvent(orgId, managerId, eventData({ startsAt: TOMORROW_LATE }), NOW),
      );
      // Everything in the early Event: the late one must not borrow any of it
      await addSpotRequest(early, await addAthlete(orgId), "approved");
      await addSpotRequest(early, viewerId, "pending");

      const list = await repo.listEvents(orgId, viewerId, { from: NOW, to: TOMORROW_END });

      expect(list).toMatchObject([
        { id: early, approvedCount: 1, mySpotRequest: "pending" },
        { id: late, approvedCount: 0, mySpotRequest: null },
      ]);
    });

    it("findEventOrg gives the id and the club of an Event", async () => {
      const { repo, createClub, addManager } = createFixture();
      // Two clubs: the club must come from the Event, not be the only one there is
      await createClub();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      await expect(repo.findEventOrg(eventId)).resolves.toEqual({ id: eventId, orgId });
    });

    it("findEventOrg of an id no Event has is null", async () => {
      const { repo } = createFixture();

      await expect(repo.findEventOrg(UNKNOWN_ID)).resolves.toBeNull();
    });

    it("cancelEvent sets cancelledAt to the moment it is cancelled", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      const result = await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      expect(result).toEqual({ ok: true, changed: true });
      const view = await repo.getEventForMember(orgId, eventId, managerId);
      expect(view?.cancelledAt).toEqual(CANCEL_AT);
    });

    it("cancelling twice changes nothing and keeps the first date", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      const again = await repo.cancelEvent(orgId, eventId, CANCEL_AGAIN_AT);

      expect(again).toEqual({ ok: true, changed: false });
      const view = await repo.getEventForMember(orgId, eventId, managerId);
      expect(view?.cancelledAt).toEqual(CANCEL_AT);
    });

    it("cancelEvent rejects an Event that starts right now", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      // now equal to startsAt: the limit. Starting at now already counts as started
      const result = await repo.cancelEvent(orgId, eventId, TOMORROW);

      expect(result).toEqual({ ok: false, reason: "started" });
      const view = await repo.getEventForMember(orgId, eventId, managerId);
      expect(view?.cancelledAt).toBeNull();
    });

    it("cancelling again after the start is still no change", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      // Cancelled and started: cancelled comes first in the fixed order
      const again = await repo.cancelEvent(orgId, eventId, TOMORROW_LATE);

      expect(again).toEqual({ ok: true, changed: false });
      const view = await repo.getEventForMember(orgId, eventId, managerId);
      expect(view?.cancelledAt).toEqual(CANCEL_AT);
    });

    it("cancelEvent of an id no Event has is not-found", async () => {
      const { repo, createClub } = createFixture();
      const orgId = await createClub();

      await expect(repo.cancelEvent(orgId, UNKNOWN_ID, CANCEL_AT)).resolves.toEqual({
        ok: false,
        reason: "not-found",
      });
    });

    it("cancelEvent of an Event of another club is not-found and leaves it as it was", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const eventId = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));

      const result = await repo.cancelEvent(orgB, eventId, CANCEL_AT);

      expect(result).toEqual({ ok: false, reason: "not-found" });
      const view = await repo.getEventForMember(orgA, eventId, managerA);
      expect(view?.cancelledAt).toBeNull();
    });

    it("a cancelled Event still shows in listEvents", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      const list = await repo.listEvents(orgId, managerId, { from: NOW, to: TOMORROW_END });

      // So the calendar can show why it no longer happens
      expect(list).toMatchObject([{ id: eventId, cancelledAt: CANCEL_AT }]);
    });

    it("updateEvent changes every field and leaves cancelledAt alone", async () => {
      const { repo, createClub, addManager, addSession } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      const sessionId = await addSession(orgId, { origin: "template", athleteId: null });
      // All four different from eventData(), so each one is checked
      const edited = eventData({
        title: "Series en pista",
        location: "Pista de Vallehermoso",
        startsAt: TOMORROW_LATE,
        sessionId,
      });

      const result = await repo.updateEvent(orgId, eventId, edited, NOW);

      expect(result).toEqual({ ok: true });
      await expect(repo.getEventForMember(orgId, eventId, managerId)).resolves.toEqual({
        id: eventId,
        orgId,
        ...edited,
        cancelledAt: null,
        approvedCount: 0,
        mySpotRequest: null,
      });
    });

    it("updateEvent of an id no Event has is not-found", async () => {
      const { repo, createClub } = createFixture();
      const orgId = await createClub();

      await expect(repo.updateEvent(orgId, UNKNOWN_ID, eventData(), NOW)).resolves.toEqual({
        ok: false,
        reason: "not-found",
      });
    });

    it("updateEvent of an Event of another club is not-found and leaves it as it was", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const eventId = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));

      const result = await repo.updateEvent(orgB, eventId, eventData({ title: "Otro" }), NOW);

      expect(result).toEqual({ ok: false, reason: "not-found" });
      const view = await repo.getEventForMember(orgA, eventId, managerA);
      expect(view?.title).toBe(eventData().title);
    });

    it("updateEvent rejects a cancelled Event and leaves it as it was", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      // Later than the cancel and before the start: only the cancel is wrong
      const result = await repo.updateEvent(
        orgId,
        eventId,
        eventData({ title: "Otro" }),
        CANCEL_AGAIN_AT,
      );

      expect(result).toEqual({ ok: false, reason: "cancelled" });
      const view = await repo.getEventForMember(orgId, eventId, managerId);
      expect(view?.title).toBe(eventData().title);
    });

    it("updateEvent rejects an Event that starts right now", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      // now equal to startsAt: the limit. The new startsAt is still in the
      // future, so only the start of the stored Event is wrong
      const result = await repo.updateEvent(
        orgId,
        eventId,
        eventData({ startsAt: TOMORROW_END }),
        TOMORROW,
      );

      expect(result).toEqual({ ok: false, reason: "started" });
      const view = await repo.getEventForMember(orgId, eventId, managerId);
      expect(view?.startsAt).toEqual(TOMORROW);
    });

    it("updateEvent rejects a new start right now and leaves the Event as it was", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      // The stored Event has not started: only the new startsAt is wrong
      const result = await repo.updateEvent(orgId, eventId, eventData({ startsAt: NOW }), NOW);

      expect(result).toEqual({ ok: false, reason: "starts-in-the-past" });
      const view = await repo.getEventForMember(orgId, eventId, managerId);
      expect(view?.startsAt).toEqual(TOMORROW);
    });

    it("updateEvent rejects a Session of another club and leaves the Event as it was", async () => {
      const { repo, createClub, addManager, addSession } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const eventId = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));
      // A valid Session in every other way: only the club is wrong
      const sessionB = await addSession(orgB, { origin: "template", athleteId: null });

      const result = await repo.updateEvent(
        orgA,
        eventId,
        eventData({ sessionId: sessionB }),
        NOW,
      );

      expect(result).toEqual({ ok: false, reason: "invalid-session" });
      const view = await repo.getEventForMember(orgA, eventId, managerA);
      expect(view?.sessionId).toBeNull();
    });

    // The other three invalid Sessions of createEvent: the contract cannot assume
    // both operations share the check
    it("updateEvent rejects a Session that does not come from a Training Template", async () => {
      const { repo, createClub, addManager, addSession } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      // athleteId null on purpose, so only the origin is wrong
      const sessionId = await addSession(orgId, { origin: "free", athleteId: null });

      await expect(
        repo.updateEvent(orgId, eventId, eventData({ sessionId }), NOW),
      ).resolves.toEqual({ ok: false, reason: "invalid-session" });
    });

    it("updateEvent rejects an Athlete's own Session, even one copied from a Training Template", async () => {
      const { repo, createClub, addManager, addAthlete, addSession } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      // origin "template" on purpose, so only the athleteId is wrong
      const sessionId = await addSession(orgId, { origin: "template", athleteId });

      await expect(
        repo.updateEvent(orgId, eventId, eventData({ sessionId }), NOW),
      ).resolves.toEqual({ ok: false, reason: "invalid-session" });
    });

    it("updateEvent rejects a Session that does not exist", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      await expect(
        repo.updateEvent(orgId, eventId, eventData({ sessionId: UNKNOWN_ID }), NOW),
      ).resolves.toEqual({ ok: false, reason: "invalid-session" });
    });

    // The fixed order: the state of the stored Event before the new data, and
    // inside the new data the start before the Session, as in createEvent
    it("updateEvent of an Event cancelled and started is cancelled", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      // now is TOMORROW: cancelled and started at once
      await expect(
        repo.updateEvent(orgId, eventId, eventData({ startsAt: TOMORROW_END }), TOMORROW),
      ).resolves.toEqual({ ok: false, reason: "cancelled" });
    });

    it("updateEvent of a started Event with a new start in the past is started", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      // now is TOMORROW and the new startsAt is NOW, earlier: both wrong
      await expect(
        repo.updateEvent(orgId, eventId, eventData({ startsAt: NOW }), TOMORROW),
      ).resolves.toEqual({ ok: false, reason: "started" });
    });

    it("updateEvent checks the new start before the Session", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      // Both wrong: the first reason in the fixed order wins
      const data = eventData({ startsAt: NOW, sessionId: UNKNOWN_ID });

      await expect(repo.updateEvent(orgId, eventId, data, NOW)).resolves.toEqual({
        ok: false,
        reason: "starts-in-the-past",
      });
    });

    it("deleteEvent deletes the Event", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      const result = await repo.deleteEvent(orgId, eventId, MANAGER);

      expect(result).toEqual({ ok: true });
      await expect(repo.getEventForMember(orgId, eventId, managerId)).resolves.toBeNull();
    });

    it("deleteEvent deletes a cancelled Event too", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      // Unlike edit and cancel: a cancelled Event can still be removed
      await expect(repo.deleteEvent(orgId, eventId, MANAGER)).resolves.toEqual({ ok: true });
      await expect(repo.getEventForMember(orgId, eventId, managerId)).resolves.toBeNull();
    });

    it("deleteEvent deletes a started Event too", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      // deleteEvent takes no now: the Event has started for the real clock, so a
      // check against the current time inside deleteEvent would make this fail
      const startsAt = new Date("2020-01-02T10:00:00.000Z");
      const createdAt = new Date("2020-01-01T10:00:00.000Z");
      const eventId = eventIdOf(
        await repo.createEvent(orgId, managerId, eventData({ startsAt }), createdAt),
      );

      await expect(repo.deleteEvent(orgId, eventId, MANAGER)).resolves.toEqual({ ok: true });
      await expect(repo.getEventForMember(orgId, eventId, managerId)).resolves.toBeNull();
    });

    it("deleteEvent of an id no Event has is not-found", async () => {
      const { repo, createClub } = createFixture();
      const orgId = await createClub();

      await expect(repo.deleteEvent(orgId, UNKNOWN_ID, MANAGER)).resolves.toEqual({
        ok: false,
        reason: "not-found",
      });
    });

    it("deleteEvent of an Event of another club is not-found and leaves it there", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const eventId = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));

      const result = await repo.deleteEvent(orgB, eventId, MANAGER);

      expect(result).toEqual({ ok: false, reason: "not-found" });
      await expect(repo.getEventForMember(orgA, eventId, managerA)).resolves.not.toBeNull();
    });
  });
}
