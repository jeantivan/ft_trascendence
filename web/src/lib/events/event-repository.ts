import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { EventMemberView } from "./contracts";

// What the repository receives to create or edit an Event: already validated by
// Zod and with startsAt already converted from the club's time zone (Fase 3)
export interface EventData {
  title: string;
  location: string;
  startsAt: Date;
  // null: a meetup without a Training Template
  sessionId: string | null;
}

// Event and its chat (#231). It does not know roles: the caller checks the
// permission first (requireOrgRole / requireOrgResource). Every operation takes
// orgId: an Event of another club is treated as if it did not exist
export interface EventRepository {
  // createdBy comes from the session, never from the client. now is a parameter,
  // not the clock, so the tests and the seed choose it
  createEvent(
    orgId: string,
    createdBy: string,
    data: EventData,
    now: Date,
  ): Promise<{ ok: true; eventId: string }>;

  // null: the Event does not exist or is from another club
  getEventForMember(
    orgId: string,
    eventId: string,
    viewerId: string,
  ): Promise<EventMemberView | null>;
}

// The production EventRepository, on Postgres
export class PrismaEventRepository implements EventRepository {
  // The client comes in from outside, like the other repositories: a test can pass its own
  constructor(private readonly db: PrismaClient = prisma) {}

  async createEvent(
    orgId: string,
    createdBy: string,
    data: EventData,
    _now: Date,
  ): Promise<{ ok: true; eventId: string }> {
    const event = await this.db.event.create({
      data: {
        orgId,
        createdBy,
        title: data.title,
        location: data.location,
        startsAt: data.startsAt,
        sessionId: data.sessionId,
        // Nested write: Prisma inserts the Event and its chat in one transaction,
        // so if the chat fails no Event is left without it
        conversation: { create: { kind: "event" } },
      },
      select: { id: true },
    });
    return { ok: true, eventId: event.id };
  }

  async getEventForMember(
    orgId: string,
    eventId: string,
    _viewerId: string,
  ): Promise<EventMemberView | null> {
    // findFirst and not findUnique: the where also has orgId, which is not unique.
    // Another club's Event is treated as one that does not exist
    const event = await this.db.event.findFirst({
      where: { id: eventId, orgId },
      select: {
        id: true,
        orgId: true,
        title: true,
        location: true,
        startsAt: true,
        sessionId: true,
        cancelledAt: true,
      },
    });
    if (!event) {
      return null;
    }
    // No Spot Requests yet (#232)
    return { ...event, approvedCount: 0, mySpotRequest: null };
  }
}
