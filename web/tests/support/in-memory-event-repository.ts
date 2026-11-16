import { randomUUID } from "node:crypto";
import type { EventMemberView } from "@/lib/events/contracts";
import type { EventData, EventRepository } from "@/lib/events/event-repository";

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

  async createEvent(
    orgId: string,
    createdBy: string,
    data: EventData,
    _now: Date,
  ): Promise<{ ok: true; eventId: string }> {
    const id = randomUUID();
    this.events.set(id, { ...data, id, orgId, createdBy, cancelledAt: null });
    return { ok: true, eventId: id };
  }

  async getEventForMember(
    orgId: string,
    eventId: string,
    _viewerId: string,
  ): Promise<EventMemberView | null> {
    const event = this.events.get(eventId);
    // Another club's Event is treated as one that does not exist
    if (!event || event.orgId !== orgId) {
      return null;
    }
    return {
      id: event.id,
      orgId: event.orgId,
      title: event.title,
      location: event.location,
      startsAt: event.startsAt,
      sessionId: event.sessionId,
      cancelledAt: event.cancelledAt,
      // No Spot Requests yet (#232)
      approvedCount: 0,
      mySpotRequest: null,
    };
  }
}
