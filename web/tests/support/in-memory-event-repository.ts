import { randomUUID } from "node:crypto";
import type { SpotRequestStatus } from "@/generated/prisma/enums";
import type { EventMemberView } from "@/lib/events/contracts";
import type { CreateEventResult, EventData, EventRepository } from "@/lib/events/event-repository";
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
    { eventId: string; userId: string; status: SpotRequestStatus }
  >();

  // For the tests only, not part of EventRepository: in production the
  // Sessions come from the Training Templates
  addSession(orgId: string, session: NewSession): string {
    const id = randomUUID();
    this.sessions.set(id, { ...session, orgId });
    return id;
  }

  // For the tests only, until #232 gives EventRepository its own operations
  addSpotRequest(eventId: string, userId: string, status: SpotRequestStatus): void {
    this.spotRequests.set(`${eventId}/${userId}`, { eventId, userId, status });
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
    if (data.sessionId !== null) {
      const session = this.sessions.get(data.sessionId);
      // Only a group Session of a Training Template of the same club (#147, question f)
      if (
        !session ||
        session.orgId !== orgId ||
        session.origin !== "template" ||
        session.athleteId !== null
      ) {
        return { ok: false, reason: "invalid-session" };
      }
    }
    const id = randomUUID();
    this.events.set(id, { ...data, id, orgId, createdBy, cancelledAt: null });
    return { ok: true, eventId: id };
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
    let approvedCount = 0;
    for (const request of this.spotRequests.values()) {
      if (request.eventId === eventId && request.status === "approved") {
        approvedCount++;
      }
    }
    const mine = this.spotRequests.get(`${eventId}/${viewerId}`);
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
}
