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
// A second request, after NOW and before TOMORROW: a createdAt that changed to
// this moment would show the request was written again
const REQUEST_AGAIN_AT = new Date("2030-01-01T12:00:00.000Z");
// When an approved Athlete withdraws: not NOW, so the test shows the chat's
// removedAt comes from the parameter
const WITHDRAW_AT = new Date("2030-01-01T14:00:00.000Z");
// When the Manager expels an approved Athlete: not NOW either, for the same reason
const EXPEL_AT = new Date("2030-01-01T16:00:00.000Z");
// A second expulsion: a removedAt that changed to this moment would show it was written again
const EXPEL_AGAIN_AT = new Date("2030-01-01T17:00:00.000Z");
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
  // That user's row in the Event's chat, or null if they have none. The
  // interface has no read for the chat: that is #126. removedAt set: they can
  // read the history but no longer write
  chatParticipant(eventId: string, userId: string): Promise<{ removedAt: Date | null } | null>;
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

// The Spot Request operations, as rows of a table: the same test runs once per
// row (it.each). run is a function kept in a field, like a function pointer in
// a C struct. unknown: the test only hands the result to expect. from is the
// state the request is in before the operation: the one it would change. to is
// the state the operation leads to. Exported for the lock tests, which only run on Postgres
export interface SpotOperation {
  name: string;
  from: "pending" | "approved" | "withdrawn";
  to: SpotRequestStatus;
  run(repo: EventRepository, orgId: string, eventId: string, athleteId: string, now: Date): Promise<unknown>;
}

export const SPOT_OPERATIONS: SpotOperation[] = [
  {
    // From withdrawn: on a pending one, asking again would change nothing
    name: "requestSpot",
    from: "withdrawn",
    to: "pending",
    run: (repo, orgId, eventId, athleteId, now) => repo.requestSpot(orgId, eventId, athleteId, now),
  },
  {
    name: "withdrawSpot",
    from: "pending",
    to: "withdrawn",
    run: (repo, orgId, eventId, athleteId, now) => repo.withdrawSpot(orgId, eventId, athleteId, now),
  },
  {
    name: "approveSpot",
    from: "pending",
    to: "approved",
    run: (repo, orgId, eventId, athleteId, now) => repo.approveSpot(orgId, eventId, athleteId, now),
  },
  {
    name: "rejectSpot",
    from: "pending",
    to: "rejected",
    run: (repo, orgId, eventId, athleteId, now) => repo.rejectSpot(orgId, eventId, athleteId, now),
  },
  {
    // From approved: what matters is that an admitted Athlete is not expelled
    name: "expelFromEvent",
    from: "approved",
    to: "rejected",
    run: (repo, orgId, eventId, athleteId, now) => repo.expelFromEvent(orgId, eventId, athleteId, now),
  },
];

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

    // The Spot Requests (#232): checked through what the operation returns and
    // what the reads show afterwards, never by looking at the table
    it("requestSpot on a future Event without a request leaves it pending", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      const result = await repo.requestSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: true, changed: true });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("pending");
    });

    it("requestSpot again on a pending request changes nothing", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId, "Ana");
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.requestSpot(orgId, eventId, athleteId, NOW);

      // A double click: the same request, a moment later
      const result = await repo.requestSpot(orgId, eventId, athleteId, REQUEST_AGAIN_AT);

      expect(result).toEqual({ ok: true, changed: false });
      // Still one request, with its first createdAt: its place in the list is kept
      const view = await repo.getEventForManager(orgId, eventId);
      expect(view?.spotRequests).toEqual([
        { athleteId, nick: "Ana", status: "pending", createdAt: NOW },
      ]);
    });

    it("requestSpot on an Event of another club is not-found and leaves no request", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const athleteB = await addAthlete(orgB);
      const eventId = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));

      // An Athlete of club B who knows the id of an Event of club A
      const result = await repo.requestSpot(orgB, eventId, athleteB, NOW);

      expect(result).toEqual({ ok: false, reason: "not-found" });
      const view = await repo.getEventForManager(orgA, eventId);
      expect(view?.spotRequests).toEqual([]);
    });

    it("requestSpot of an id no Event has is not-found", async () => {
      const { repo, createClub, addAthlete } = createFixture();
      const orgId = await createClub();
      const athleteId = await addAthlete(orgId);

      await expect(repo.requestSpot(orgId, UNKNOWN_ID, athleteId, NOW)).resolves.toEqual({
        ok: false,
        reason: "not-found",
      });
    });

    it("requestSpot on a cancelled Event is cancelled and leaves no request", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      // After the cancel and before the start: cancelled is the only reason
      const result = await repo.requestSpot(orgId, eventId, athleteId, CANCEL_AGAIN_AT);

      expect(result).toEqual({ ok: false, reason: "cancelled" });
      const view = await repo.getEventForManager(orgId, eventId);
      expect(view?.spotRequests).toEqual([]);
    });

    it("requestSpot on an Event that starts right now is started and leaves no request", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      // TOMORROW and not later: the limit. Starting at now already counts as started
      const result = await repo.requestSpot(orgId, eventId, athleteId, TOMORROW);

      expect(result).toEqual({ ok: false, reason: "started" });
      const view = await repo.getEventForManager(orgId, eventId);
      expect(view?.spotRequests).toEqual([]);
    });

    it("requestSpot on an Event cancelled and started is cancelled", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      // Both reasons apply: cancelled comes first in the fixed order
      await expect(repo.requestSpot(orgId, eventId, athleteId, TOMORROW)).resolves.toEqual({
        ok: false,
        reason: "cancelled",
      });
    });

    it("withdrawSpot on a pending request leaves it withdrawn", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.requestSpot(orgId, eventId, athleteId, NOW);

      // NOW again: withdrawing a pending request stores no time
      const result = await repo.withdrawSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: true, changed: true });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("withdrawn");
    });

    it("withdrawSpot again on a withdrawn request changes nothing", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.requestSpot(orgId, eventId, athleteId, NOW);
      await repo.withdrawSpot(orgId, eventId, athleteId, NOW);

      // A double click on "withdraw"
      const result = await repo.withdrawSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: true, changed: false });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("withdrawn");
    });

    it("withdrawSpot without a request is no-request and leaves none", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      const result = await repo.withdrawSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: false, reason: "no-request" });
      // Nothing created either: no withdrawn row out of nowhere
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBeNull();
    });

    it("withdrawSpot on an Event of another club is not-found and leaves the request", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const athleteA = await addAthlete(orgA);
      const eventId = eventIdOf(await repo.createEvent(orgA, managerA, eventData(), NOW));
      await repo.requestSpot(orgA, eventId, athleteA, NOW);

      // The request exists, but the call says club B
      const result = await repo.withdrawSpot(orgB, eventId, athleteA, NOW);

      expect(result).toEqual({ ok: false, reason: "not-found" });
      // Read with the real club: still pending
      const view = await repo.getEventForMember(orgA, eventId, athleteA);
      expect(view?.mySpotRequest).toBe("pending");
    });

    it("requestSpot after withdrawing asks again, as a new request", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId, "Ana");
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.requestSpot(orgId, eventId, athleteId, NOW);
      await repo.withdrawSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.requestSpot(orgId, eventId, athleteId, REQUEST_AGAIN_AT);

      expect(result).toEqual({ ok: true, changed: true });
      // One row, reused, with the new createdAt: it goes to the end of the Manager's list
      const view = await repo.getEventForManager(orgId, eventId);
      expect(view?.spotRequests).toEqual([
        { athleteId, nick: "Ana", status: "pending", createdAt: REQUEST_AGAIN_AT },
      ]);
    });

    // The start of the table tests: an Athlete with a pending request in an
    // Event of tomorrow. The same for every row, so the Event decides the result
    async function withPendingRequest() {
      const fixture = createFixture();
      const { repo, createClub, addManager, addAthlete } = fixture;
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await repo.requestSpot(orgId, eventId, athleteId, NOW);
      // ...fixture copies every field of the fixture (repo, createClub,
      // chatParticipant...) into the object returned
      return { ...fixture, orgId, eventId, athleteId };
    }

    // The start of a row: its request in the state from of the row
    async function withRequestIn(from: SpotOperation["from"]) {
      const start = await withPendingRequest();
      if (from === "approved") {
        await start.repo.approveSpot(start.orgId, start.eventId, start.athleteId, NOW);
      }
      if (from === "withdrawn") {
        await start.repo.withdrawSpot(start.orgId, start.eventId, start.athleteId, NOW);
      }
      return start;
    }

    it.each(SPOT_OPERATIONS)("$name on an Event of another club is not-found and changes nothing", async ({ run, from }) => {
      const { repo, createClub, orgId, eventId, athleteId } = await withRequestIn(from);
      const otherClub = await createClub();

      const result = await run(repo, otherClub, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: false, reason: "not-found" });
      // Read with the real club: still in the state it started in
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe(from);
    });

    // R4: with the Event cancelled or started, nothing changes, not even a repetition
    it.each(SPOT_OPERATIONS)("$name on a cancelled Event is cancelled and changes nothing", async ({ run, from }) => {
      const { repo, orgId, eventId, athleteId } = await withRequestIn(from);
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      const result = await run(repo, orgId, eventId, athleteId, CANCEL_AGAIN_AT);

      expect(result).toEqual({ ok: false, reason: "cancelled" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe(from);
    });

    it.each(SPOT_OPERATIONS)("$name on an Event that starts right now is started and changes nothing", async ({ run, from }) => {
      const { repo, orgId, eventId, athleteId } = await withRequestIn(from);

      const result = await run(repo, orgId, eventId, athleteId, TOMORROW);

      expect(result).toEqual({ ok: false, reason: "started" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe(from);
    });

    it.each(SPOT_OPERATIONS)("$name on an Event cancelled and started is cancelled, not started", async ({ run, from }) => {
      const { repo, orgId, eventId, athleteId } = await withRequestIn(from);
      await repo.cancelEvent(orgId, eventId, CANCEL_AT);

      await expect(run(repo, orgId, eventId, athleteId, TOMORROW)).resolves.toEqual({
        ok: false,
        reason: "cancelled",
      });
    });

    it("approveSpot on a pending request approves it and lets the Athlete into the chat", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();

      const result = await repo.approveSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: true, changed: true });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("approved");
      expect(view?.approvedCount).toBe(1);
      // An active row: they can write in the Event's chat
      await expect(chatParticipant(eventId, athleteId)).resolves.toEqual({ removedAt: null });
    });

    it("approveSpot again on an approved request changes nothing", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.approveSpot(orgId, eventId, athleteId, NOW);

      // A double click, or two Managers with the same decision
      const result = await repo.approveSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: true, changed: false });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("approved");
      expect(view?.approvedCount).toBe(1);
      await expect(chatParticipant(eventId, athleteId)).resolves.toEqual({ removedAt: null });
    });

    it("approveSpot without a request is no-request and lets nobody into the chat", async () => {
      const { repo, createClub, addManager, addAthlete, chatParticipant } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      const result = await repo.approveSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: false, reason: "no-request" });
      await expect(chatParticipant(eventId, athleteId)).resolves.toBeNull();
    });

    it("approveSpot on a withdrawn request is status-changed and lets nobody into the chat", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      // The Athlete withdrew while the Manager had the list open
      await repo.withdrawSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.approveSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: false, reason: "status-changed" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("withdrawn");
      await expect(chatParticipant(eventId, athleteId)).resolves.toBeNull();
    });

    it("withdrawSpot on an approved request frees the spot and leaves the chat read-only", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.approveSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.withdrawSpot(orgId, eventId, athleteId, WITHDRAW_AT);

      expect(result).toEqual({ ok: true, changed: true });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("withdrawn");
      expect(view?.approvedCount).toBe(0);
      // The row stays, with removedAt: they still read the history, as in the DMs (#155)
      await expect(chatParticipant(eventId, athleteId)).resolves.toEqual({ removedAt: WITHDRAW_AT });
    });

    it("withdrawSpot on a pending request leaves nobody in the chat", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();

      await repo.withdrawSpot(orgId, eventId, athleteId, WITHDRAW_AT);

      await expect(chatParticipant(eventId, athleteId)).resolves.toBeNull();
    });

    it("approving again after withdrawing makes the same chat row active again", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.approveSpot(orgId, eventId, athleteId, NOW);
      await repo.withdrawSpot(orgId, eventId, athleteId, WITHDRAW_AT);
      await repo.requestSpot(orgId, eventId, athleteId, REQUEST_AGAIN_AT);

      await repo.approveSpot(orgId, eventId, athleteId, REQUEST_AGAIN_AT);

      // removedAt back to null: they write again, and the history is the same row's
      await expect(chatParticipant(eventId, athleteId)).resolves.toEqual({ removedAt: null });
    });

    it("rejectSpot on a pending request rejects it and lets nobody into the chat", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();

      const result = await repo.rejectSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: true, changed: true });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("rejected");
      await expect(chatParticipant(eventId, athleteId)).resolves.toBeNull();
    });

    it("rejectSpot again on a rejected request changes nothing", async () => {
      const { repo, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.rejectSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.rejectSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: true, changed: false });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("rejected");
    });

    it("rejectSpot without a request is no-request", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      await expect(repo.rejectSpot(orgId, eventId, athleteId, NOW)).resolves.toEqual({
        ok: false,
        reason: "no-request",
      });
    });

    it("rejectSpot on an approved request is status-changed and never expels", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      // Another Manager approved it while this one had the list open
      await repo.approveSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.rejectSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: false, reason: "status-changed" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("approved");
      await expect(chatParticipant(eventId, athleteId)).resolves.toEqual({ removedAt: null });
    });

    it("requestSpot on a rejected request is rejected: the rejection is for good", async () => {
      const { repo, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.rejectSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.requestSpot(orgId, eventId, athleteId, REQUEST_AGAIN_AT);

      expect(result).toEqual({ ok: false, reason: "rejected" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("rejected");
    });

    it("withdrawSpot on a rejected request is rejected: withdrawing is no way back in", async () => {
      const { repo, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.rejectSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.withdrawSpot(orgId, eventId, athleteId, WITHDRAW_AT);

      expect(result).toEqual({ ok: false, reason: "rejected" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("rejected");
    });

    it("approveSpot on a rejected request is status-changed and lets nobody into the chat", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      // Another Manager rejected it while this one had the list open
      await repo.rejectSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.approveSpot(orgId, eventId, athleteId, NOW);

      expect(result).toEqual({ ok: false, reason: "status-changed" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("rejected");
      await expect(chatParticipant(eventId, athleteId)).resolves.toBeNull();
    });

    it("requestSpot on an approved request changes nothing and keeps the spot", async () => {
      const { repo, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.approveSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.requestSpot(orgId, eventId, athleteId, REQUEST_AGAIN_AT);

      expect(result).toEqual({ ok: true, changed: false });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("approved");
    });

    it("expelFromEvent on an approved request rejects it and leaves the chat read-only", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.approveSpot(orgId, eventId, athleteId, NOW);

      const result = await repo.expelFromEvent(orgId, eventId, athleteId, EXPEL_AT);

      expect(result).toEqual({ ok: true, changed: true });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("rejected");
      expect(view?.approvedCount).toBe(0);
      // As when withdrawing: the row stays, they read the history but no longer write
      await expect(chatParticipant(eventId, athleteId)).resolves.toEqual({ removedAt: EXPEL_AT });
    });

    it("expelFromEvent without a request is no-request", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));

      await expect(repo.expelFromEvent(orgId, eventId, athleteId, EXPEL_AT)).resolves.toEqual({
        ok: false,
        reason: "no-request",
      });
    });

    it("expelFromEvent again on an expelled request changes nothing", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.approveSpot(orgId, eventId, athleteId, NOW);
      await repo.expelFromEvent(orgId, eventId, athleteId, EXPEL_AT);

      // A double click, or another Manager with the same decision
      const result = await repo.expelFromEvent(orgId, eventId, athleteId, EXPEL_AGAIN_AT);

      expect(result).toEqual({ ok: true, changed: false });
      // The moment they left the chat stays the first one
      await expect(chatParticipant(eventId, athleteId)).resolves.toEqual({ removedAt: EXPEL_AT });
    });

    it("expelFromEvent on a pending request is status-changed and never rejects", async () => {
      const { repo, orgId, eventId, athleteId } = await withPendingRequest();

      const result = await repo.expelFromEvent(orgId, eventId, athleteId, EXPEL_AT);

      expect(result).toEqual({ ok: false, reason: "status-changed" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("pending");
    });

    it("expelFromEvent on a withdrawn request is status-changed and keeps the chat as it was", async () => {
      const { repo, chatParticipant, orgId, eventId, athleteId } = await withPendingRequest();
      await repo.approveSpot(orgId, eventId, athleteId, NOW);
      // The Athlete withdrew while the Manager had the list open
      await repo.withdrawSpot(orgId, eventId, athleteId, WITHDRAW_AT);

      const result = await repo.expelFromEvent(orgId, eventId, athleteId, EXPEL_AT);

      expect(result).toEqual({ ok: false, reason: "status-changed" });
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe("withdrawn");
      await expect(chatParticipant(eventId, athleteId)).resolves.toEqual({ removedAt: WITHDRAW_AT });
    });

    // Postgres compares uuids case-insensitively, JavaScript strings do not: an id sent
    // in upper case must work as in lower case in both implementations (review of #241).
    // The ids come from randomUUID or Postgres, so they always have hex letters to change
    it("createEvent takes the club, the Manager and the Session in upper case and keeps them in lower case", async () => {
      const { repo, createClub, addManager, addAthlete, addSession } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const sessionId = await addSession(orgId, { origin: "template", athleteId: null });

      const eventId = eventIdOf(
        await repo.createEvent(
          orgId.toUpperCase(),
          managerId.toUpperCase(),
          eventData({ sessionId: sessionId.toUpperCase() }),
          NOW,
        ),
      );

      await expect(repo.getEventForMember(orgId, eventId, athleteId)).resolves.toMatchObject({
        id: eventId,
        orgId,
        sessionId,
      });
    });

    it("the reads take the club, the Event and the viewer in upper case", async () => {
      const { repo, createClub, addManager, addAthlete, addSpotRequest } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId, "Ana");
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      await addSpotRequest(eventId, athleteId, "pending");
      const org = orgId.toUpperCase();
      const event = eventId.toUpperCase();
      const viewer = athleteId.toUpperCase();

      await expect(repo.getEventForMember(org, event, viewer)).resolves.toMatchObject({
        id: eventId,
        orgId,
        mySpotRequest: "pending",
      });
      await expect(repo.getEventForManager(org, event)).resolves.toMatchObject({
        id: eventId,
        orgId,
        spotRequests: [{ athleteId, nick: "Ana", status: "pending" }],
      });
      await expect(repo.listEvents(org, viewer, { from: NOW, to: TOMORROW_END })).resolves.toMatchObject([
        { id: eventId, orgId, mySpotRequest: "pending" },
      ]);
      await expect(repo.findEventOrg(event)).resolves.toEqual({ id: eventId, orgId });
    });

    it("updateEvent, cancelEvent and deleteEvent take the club and the Event in upper case", async () => {
      const { repo, createClub, addManager } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const eventId = eventIdOf(await repo.createEvent(orgId, managerId, eventData(), NOW));
      const org = orgId.toUpperCase();
      const event = eventId.toUpperCase();

      await expect(repo.updateEvent(org, event, eventData({ title: "Series en pista" }), NOW)).resolves.toEqual({
        ok: true,
      });
      await expect(repo.cancelEvent(org, event, CANCEL_AT)).resolves.toEqual({ ok: true, changed: true });
      await expect(repo.getEventForMember(orgId, eventId, managerId)).resolves.toMatchObject({
        title: "Series en pista",
        cancelledAt: CANCEL_AT,
      });
      await expect(repo.deleteEvent(org, event, MANAGER)).resolves.toEqual({ ok: true });
      await expect(repo.getEventForMember(orgId, eventId, managerId)).resolves.toBeNull();
    });

    // R9
    it.each(SPOT_OPERATIONS)("$name takes the club, the Event and the Athlete in upper case", async ({ run, from, to }) => {
      const { repo, orgId, eventId, athleteId } = await withRequestIn(from);

      const result = await run(repo, orgId.toUpperCase(), eventId.toUpperCase(), athleteId.toUpperCase(), NOW);

      expect(result).toEqual({ ok: true, changed: true });
      // Read in lower case: the change is on the same request, not on a new one
      const view = await repo.getEventForMember(orgId, eventId, athleteId);
      expect(view?.mySpotRequest).toBe(to);
    });
  });
}
