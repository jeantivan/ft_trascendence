import { randomUUID } from "node:crypto";
import type { SpotRequestStatus } from "@/generated/prisma/enums";
import type { EventManagerView, EventMemberView } from "@/lib/events/contracts";
import type {
  CancelEventResult,
  CreateEventResult,
  EventData,
  EventRepository,
  UpdateEventResult,
} from "@/lib/events/event-repository";
import type { NewSession } from "./event-repository-contract";

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

  async createEvent(
    orgId: string,
    createdBy: string,
    data: EventData,
    now: Date,
  ): Promise<CreateEventResult> {
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
    const event = this.events.get(eventId);
    // The ifs follow the fixed order: not-found, cancelled, started
    if (!event || event.orgId !== orgId) {
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

  // Whether a Session can be linked to an Event of that club: only a group
  // Session of a Training Template of the same club (#147, question f).
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
    const event = this.events.get(eventId);
    // The ifs follow the fixed order: not-found, cancelled, started
    if (!event || event.orgId !== orgId) {
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

  async listEvents(
    orgId: string,
    viewerId: string,
    range: { from: Date; to: Date },
  ): Promise<EventMemberView[]> {
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
    const event = this.events.get(eventId);
    // Another club's Event is treated as one that does not exist
    if (!event || event.orgId !== orgId) {
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
    const event = this.events.get(eventId);
    // Another club's Event is treated as one that does not exist
    if (!event || event.orgId !== orgId) {
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
    const event = this.events.get(eventId);
    if (!event) {
      return null;
    }
    // Only these two fields, like the select of the Prisma one
    return { id: event.id, orgId: event.orgId };
  }
}
