import { randomUUID } from "node:crypto";
import type { SpotRequestStatus } from "@/generated/prisma/enums";
import type { EventManagerView, EventMemberView } from "@/lib/events/contracts";
import type {
  CancelEventResult,
  CreateEventResult,
  DeleteEventResult,
  EventData,
  EventRepository,
  RequestSpotResult,
  ReviewSpotResult,
  UpdateEventResult,
  WithdrawSpotResult,
} from "@/lib/events/event-repository";
import { normalizeId } from "@/lib/org/schemas";
import type { NewSession } from "./event-repository-contract";

// Postgres compares uuids case-insensitively and returns them in lower case; a Map and
// === do not. So every method lower-cases the ids it receives first, as the club's
// in-memory repository does, and an id sent in upper case finds the same rows
function withNormalizedSession(data: EventData): EventData {
  return { ...data, sessionId: data.sessionId === null ? null : normalizeId(data.sessionId) };
}

// An Event as stored: like a row of the events table
interface StoredEvent extends EventData {
  id: string;
  orgId: string;
  createdBy: string;
  cancelledAt: Date | null;
}

// EventRepository for tests, without a database. Same rules as the Prisma one:
// both run the same contract (event-repository-contract.ts)
export class InMemoryEventRepository implements EventRepository {
  // Events by id
  private events = new Map<string, StoredEvent>();
  // Sessions by id: only what the rules of a linked Session look at
  private sessions = new Map<string, NewSession & { orgId: string }>();
  // Spot Requests by "eventId/userId": one per user and Event, like the
  // primary key (event_id, user_id) of spot_requests
  private spotRequests = new Map<
    string,
    { eventId: string; userId: string; status: SpotRequestStatus; createdAt: Date }
  >();
  // Nicks by user id: the only thing of a user the Manager's list shows.
  // null: a user without a nick, as nick is optional in users
  private nicks = new Map<string, string | null>();
  // Rows of each Event's chat by "eventId/userId", like conversation_participants
  // (one chat per Event). removedAt set: can read the history, no longer write
  private chatParticipants = new Map<string, { removedAt: Date | null }>();

  // For the tests only: in production the users come from sign-up
  addUser(nick: string | null): string {
    const id = randomUUID();
    this.nicks.set(id, nick);
    return id;
  }

  // For the tests only, not part of EventRepository: in production the
  // Sessions come from the Training Templates
  addSession(orgId: string, session: NewSession): string {
    const id = randomUUID();
    this.sessions.set(id, { ...session, orgId });
    return id;
  }

  // For the tests only, until #232 gives EventRepository its own operations
  addSpotRequest(
    eventId: string,
    userId: string,
    status: SpotRequestStatus,
    createdAt: Date = new Date(),
  ): void {
    this.spotRequests.set(`${eventId}/${userId}`, { eventId, userId, status, createdAt });
  }

  // For the tests only: EventRepository has no read for the chat (#126).
  // A copy, so a test cannot change the stored row by accident
  chatParticipant(eventId: string, userId: string): { removedAt: Date | null } | null {
    const row = this.chatParticipants.get(`${eventId}/${userId}`);
    return row === undefined ? null : { removedAt: row.removedAt };
  }

  async createEvent(
    orgId: string,
    createdBy: string,
    data: EventData,
    now: Date,
  ): Promise<CreateEventResult> {
    orgId = normalizeId(orgId);
    createdBy = normalizeId(createdBy);
    data = withNormalizedSession(data);
    // Starting at now already counts as started
    if (data.startsAt <= now) {
      return { ok: false, reason: "starts-in-the-past" };
    }
    if (data.sessionId !== null && !this.sessionIsValid(orgId, data.sessionId)) {
      return { ok: false, reason: "invalid-session" };
    }
    const id = randomUUID();
    this.events.set(id, { ...data, id, orgId, createdBy, cancelledAt: null });
    return { ok: true, eventId: id };
  }

  async updateEvent(
    orgId: string,
    eventId: string,
    data: EventData,
    now: Date,
  ): Promise<UpdateEventResult> {
    orgId = normalizeId(orgId);
    eventId = normalizeId(eventId);
    data = withNormalizedSession(data);
    const event = this.findInClub(orgId, eventId);
    // The ifs follow the fixed order: not-found, cancelled, started
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: false, reason: "cancelled" };
    }
    // Starting at now already counts as started
    if (event.startsAt <= now) {
      return { ok: false, reason: "started" };
    }
    // The new data, after the state and in the same order as createEvent
    if (data.startsAt <= now) {
      return { ok: false, reason: "starts-in-the-past" };
    }
    if (data.sessionId !== null && !this.sessionIsValid(orgId, data.sessionId)) {
      return { ok: false, reason: "invalid-session" };
    }
    // Field by field and not { ...data }: an object may carry more fields than
    // its type says, and cancelledAt must never change here
    event.title = data.title;
    event.location = data.location;
    event.startsAt = data.startsAt;
    event.sessionId = data.sessionId;
    return { ok: true };
  }

  // The Event of that club, or undefined. Another club's Event is treated as
  // one that does not exist. Shared by every operation that takes orgId
  private findInClub(orgId: string, eventId: string): StoredEvent | undefined {
    const event = this.events.get(eventId);
    if (!event || event.orgId !== orgId) {
      return undefined;
    }
    return event;
  }

  // Whether a Session can be linked to an Event of that club: only a Template
  // Session of the Group (no athleteId) of the same club (#147, question f).
  // Shared by createEvent and updateEvent
  private sessionIsValid(orgId: string, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return (
      session !== undefined &&
      session.orgId === orgId &&
      session.origin === "template" &&
      session.athleteId === null
    );
  }

  async cancelEvent(orgId: string, eventId: string, now: Date): Promise<CancelEventResult> {
    orgId = normalizeId(orgId);
    eventId = normalizeId(eventId);
    const event = this.findInClub(orgId, eventId);
    // The ifs follow the fixed order: not-found, cancelled, started
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: true, changed: false };
    }
    // Starting at now already counts as started
    if (event.startsAt <= now) {
      return { ok: false, reason: "started" };
    }
    // event is a reference to the object in the Map: this changes the stored one
    event.cancelledAt = now;
    return { ok: true, changed: true };
  }

  // Without the actor of the interface: no audit rows here, so who deletes changes
  // nothing. An implementation may leave out the parameters it does not use at the end
  async deleteEvent(orgId: string, eventId: string): Promise<DeleteEventResult> {
    orgId = normalizeId(orgId);
    eventId = normalizeId(eventId);
    const event = this.findInClub(orgId, eventId);
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    this.events.delete(eventId);
    // Its Spot Requests go with it, like onDelete: Cascade in the schema.
    // Deleting from a Map while looping over it is safe in JavaScript
    for (const [key, request] of this.spotRequests) {
      if (request.eventId === eventId) {
        this.spotRequests.delete(key);
      }
    }
    return { ok: true };
  }

  async requestSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<RequestSpotResult> {
    // The Event first, in the fixed order
    const event = this.findInClub(orgId, eventId);
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: false, reason: "cancelled" };
    }
    // Starting at now already counts as started
    if (event.startsAt <= now) {
      return { ok: false, reason: "started" };
    }
    // Same key as addSpotRequest: one Spot Request per user and Event
    const key = `${eventId}/${athleteId}`;
    // Already pending or approved: a double click. Nothing is written, so
    // createdAt and its place in the Manager's list stay as they were, and an
    // approved Athlete keeps their spot
    const status = this.spotRequests.get(key)?.status;
    // A rejection is for good for that Event
    if (status === "rejected") {
      return { ok: false, reason: "rejected" };
    }
    if (status === "pending" || status === "approved") {
      return { ok: true, changed: false };
    }
    // createdAt is now: the Manager's list orders by it
    this.spotRequests.set(key, {
      eventId,
      userId: athleteId,
      status: "pending",
      createdAt: now,
    });
    return { ok: true, changed: true };
  }

  async withdrawSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<WithdrawSpotResult> {
    // The Event first, in the fixed order
    const event = this.findInClub(orgId, eventId);
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: false, reason: "cancelled" };
    }
    // Starting at now already counts as started
    if (event.startsAt <= now) {
      return { ok: false, reason: "started" };
    }
    const request = this.spotRequests.get(`${eventId}/${athleteId}`);
    if (request === undefined) {
      return { ok: false, reason: "no-request" };
    }
    // Rejected stays rejected: withdrawing it would open a way to ask again
    if (request.status === "rejected") {
      return { ok: false, reason: "rejected" };
    }
    // Already withdrawn: a double click, nothing is written
    if (request.status === "withdrawn") {
      return { ok: true, changed: false };
    }
    // An approved Athlete leaves the chat, as in Prisma: the row stays with
    // removedAt. Read before changing status, which is what says it was approved
    const participant = this.chatParticipants.get(`${eventId}/${athleteId}`);
    if (request.status === "approved" && participant !== undefined) {
      participant.removedAt = now;
    }
    // get gives a reference to the object in the Map: this changes the stored one
    request.status = "withdrawn";
    return { ok: true, changed: true };
  }

  async approveSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<ReviewSpotResult> {
    // The Event first, in the fixed order
    const event = this.findInClub(orgId, eventId);
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: false, reason: "cancelled" };
    }
    // Starting at now already counts as started
    if (event.startsAt <= now) {
      return { ok: false, reason: "started" };
    }
    // Then the Spot Request
    const key = `${eventId}/${athleteId}`;
    const request = this.spotRequests.get(key);
    if (request === undefined) {
      return { ok: false, reason: "no-request" };
    }
    // Already approved: a double click, or another Manager with the same decision
    if (request.status === "approved") {
      return { ok: true, changed: false };
    }
    // Only a pending request is approved
    if (request.status !== "pending") {
      return { ok: false, reason: "status-changed" };
    }
    request.status = "approved";
    // set and not get: a new row, or the old one made active again
    this.chatParticipants.set(key, { removedAt: null });
    return { ok: true, changed: true };
  }

  async rejectSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<ReviewSpotResult> {
    // The Event first, in the fixed order
    const event = this.findInClub(orgId, eventId);
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: false, reason: "cancelled" };
    }
    // Starting at now already counts as started
    if (event.startsAt <= now) {
      return { ok: false, reason: "started" };
    }
    // Then the Spot Request
    const request = this.spotRequests.get(`${eventId}/${athleteId}`);
    if (request === undefined) {
      return { ok: false, reason: "no-request" };
    }
    // Already rejected: a double click, or another Manager with the same decision
    if (request.status === "rejected") {
      return { ok: true, changed: false };
    }
    // Only a pending request is rejected: an approved one would be an expulsion
    if (request.status !== "pending") {
      return { ok: false, reason: "status-changed" };
    }
    // A pending request was never in the chat: nothing to do there
    request.status = "rejected";
    return { ok: true, changed: true };
  }

  async expelFromEvent(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<ReviewSpotResult> {
    // The Event first, in the fixed order
    const event = this.findInClub(orgId, eventId);
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: false, reason: "cancelled" };
    }
    // Starting at now already counts as started
    if (event.startsAt <= now) {
      return { ok: false, reason: "started" };
    }
    const key = `${eventId}/${athleteId}`;
    const request = this.spotRequests.get(key);
    if (request === undefined) {
      return { ok: false, reason: "no-request" };
    }
    // Already rejected: nothing is written, removedAt keeps the moment they left
    if (request.status === "rejected") {
      return { ok: true, changed: false };
    }
    // Only an approved request is expelled
    if (request.status !== "approved") {
      return { ok: false, reason: "status-changed" };
    }
    request.status = "rejected";
    // As in Prisma: the row stays with removedAt
    const participant = this.chatParticipants.get(key);
    if (participant !== undefined) {
      participant.removedAt = now;
    }
    return { ok: true, changed: true };
  }

  async listEvents(
    orgId: string,
    viewerId: string,
    range: { from: Date; to: Date },
  ): Promise<EventMemberView[]> {
    orgId = normalizeId(orgId);
    viewerId = normalizeId(viewerId);
    const list: EventMemberView[] = [];
    for (const event of this.events.values()) {
      // [from, to): from included, to left out. Cancelled ones too
      if (event.orgId === orgId && event.startsAt >= range.from && event.startsAt < range.to) {
        list.push(this.memberView(event, viewerId));
      }
    }
    list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return list;
  }

  async getEventForMember(
    orgId: string,
    eventId: string,
    viewerId: string,
  ): Promise<EventMemberView | null> {
    orgId = normalizeId(orgId);
    eventId = normalizeId(eventId);
    viewerId = normalizeId(viewerId);
    const event = this.findInClub(orgId, eventId);
    if (!event) {
      return null;
    }
    return this.memberView(event, viewerId);
  }

  // What a member sees of an Event already found: shared by listEvents and
  // getEventForMember. private: only the methods of this class can call it
  private memberView(event: StoredEvent, viewerId: string): EventMemberView {
    let approvedCount = 0;
    for (const request of this.spotRequests.values()) {
      if (request.eventId === event.id && request.status === "approved") {
        approvedCount++;
      }
    }
    const mine = this.spotRequests.get(`${event.id}/${viewerId}`);
    return {
      id: event.id,
      orgId: event.orgId,
      title: event.title,
      location: event.location,
      startsAt: event.startsAt,
      sessionId: event.sessionId,
      cancelledAt: event.cancelledAt,
      approvedCount,
      // null: no Spot Request of their own
      mySpotRequest: mine?.status ?? null,
    };
  }

  async getEventForManager(orgId: string, eventId: string): Promise<EventManagerView | null> {
    orgId = normalizeId(orgId);
    eventId = normalizeId(eventId);
    const event = this.findInClub(orgId, eventId);
    if (!event) {
      return null;
    }
    // The type of the spotRequests field of EventManagerView
    const spotRequests: EventManagerView["spotRequests"] = [];
    let approvedCount = 0;
    for (const request of this.spotRequests.values()) {
      if (request.eventId !== eventId) {
        continue;
      }
      if (request.status === "approved") {
        approvedCount++;
      }
      spotRequests.push({
        athleteId: request.userId,
        // nick is optional in users: an empty one, as in the rest of the app
        nick: this.nicks.get(request.userId) ?? "",
        status: request.status,
        createdAt: request.createdAt,
      });
    }
    // Oldest first, like qsort with a compare function
    spotRequests.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return {
      id: event.id,
      orgId: event.orgId,
      title: event.title,
      location: event.location,
      startsAt: event.startsAt,
      sessionId: event.sessionId,
      cancelledAt: event.cancelledAt,
      approvedCount,
      spotRequests,
    };
  }

  async findEventOrg(eventId: string): Promise<{ id: string; orgId: string } | null> {
    const event = this.events.get(normalizeId(eventId));
    if (!event) {
      return null;
    }
    // Only these two fields, like the select of the Prisma one
    return { id: event.id, orgId: event.orgId };
  }
}
