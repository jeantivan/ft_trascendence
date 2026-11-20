import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { recordAdminAction } from "@/lib/gdpr/record-admin-action";
import { normalizeId } from "@/lib/org/schemas";
import { prisma } from "@/lib/prisma";
import type { EventManagerView, EventMemberView } from "./contracts";

// What the repository receives to create or edit an Event: already validated by
// Zod and with startsAt already converted from the club's time zone (Fase 3)
export interface EventData {
  title: string;
  location: string;
  startsAt: Date;
  // null: a meetup without a Training Template
  sessionId: string | null;
}

// An expected failure is a value, not an exception: the caller checks ok and,
// if false, turns reason into a message. Exceptions are only for the unexpected
export type CreateEventResult =
  | { ok: true; eventId: string }
  // startsAt is now or earlier: the Event would be born already started
  | { ok: false; reason: "starts-in-the-past" }
  // The linked Session does not exist, is from another club or is not a
  // Template Session of the Group (no athleteId). One reason for all three:
  // the caller cannot tell whether another club's Session exists
  | { ok: false; reason: "invalid-session" };

// The reasons in the fixed order of the spec: when several apply, the first wins
export type UpdateEventResult =
  | { ok: true }
  // Does not exist or is from another club
  | { ok: false; reason: "not-found" }
  // A cancelled Event is history: it is not edited
  | { ok: false; reason: "cancelled" }
  // startsAt is now or earlier: it may already have Feedback
  | { ok: false; reason: "started" }
  // The new startsAt is now or earlier: the Event would be frozen by accident
  | { ok: false; reason: "starts-in-the-past" }
  // As in CreateEventResult: one reason for the three cases
  | { ok: false; reason: "invalid-session" };

export type CancelEventResult =
  // changed false: it was already cancelled, and keeps the first date. So a
  // double click is not an error
  | { ok: true; changed: boolean }
  // Does not exist or is from another club
  | { ok: false; reason: "not-found" }
  // startsAt is now or earlier: no Feedback may hang from a cancelled Event
  | { ok: false; reason: "started" };

// The Athlete asks for a spot (#232). changed false: the request was already
// pending or approved, so a double click is not an error
export type RequestSpotResult =
  | { ok: true; changed: boolean }
  // Does not exist or is from another club
  | { ok: false; reason: "not-found" }
  // A cancelled Event takes no requests, not even a repeated one
  | { ok: false; reason: "cancelled" }
  // startsAt is now or earlier: too late to ask
  | { ok: false; reason: "started" };

// The Athlete withdraws their Spot Request (#232). changed false: it was
// already withdrawn
export type WithdrawSpotResult =
  | { ok: true; changed: boolean }
  // Does not exist or is from another club. Before no-request, so another
  // club's Event never shows it exists
  | { ok: false; reason: "not-found" }
  // As in RequestSpotResult: with the Event cancelled or started, the spot stays
  // as it was, not even a repetition passes
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "started" }
  // The Athlete never asked: the UI shows no "withdraw" then, but a Server
  // Action can be called directly
  | { ok: false; reason: "no-request" };

// The Manager's three decisions (#232): approveSpot, rejectSpot and
// expelFromEvent share it, as they have the same reasons
export type ReviewSpotResult =
  | { ok: true; changed: boolean }
  // Does not exist or is from another club
  | { ok: false; reason: "not-found" }
  // With the Event cancelled or started, no spot is reviewed
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "started" }
  // No Spot Request: the Athlete deleted their account after the list was loaded
  | { ok: false; reason: "no-request" }
  // The request is not in the state the decision starts from: another Manager
  // or the Athlete got there first. The Server Action turns it into a 409
  | { ok: false; reason: "status-changed" };

// Who deletes: only the Admin's deletion is audited (Marta, question e of #147:
// the Privacy Policy, section 7, promises nothing more), so only the Admin carries an id
export type DeleteEventActor = { kind: "manager" } | { kind: "admin"; adminId: string };

export type DeleteEventResult =
  | { ok: true }
  // Does not exist or is from another club
  | { ok: false; reason: "not-found" };

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
  ): Promise<CreateEventResult>;

  // data has every field, not only the changed ones. Never touches cancelledAt
  updateEvent(
    orgId: string,
    eventId: string,
    data: EventData,
    now: Date,
  ): Promise<UpdateEventResult>;

  // Sets cancelledAt to now, only before it starts. Already cancelled comes
  // before started in the fixed order: a second cancel after the start is
  // still { ok: true, changed: false }
  cancelEvent(orgId: string, eventId: string, now: Date): Promise<CancelEventResult>;

  // At any moment, started or cancelled too: no now. Its chat and Spot Requests
  // go with it; its Feedback stays, without the Event
  deleteEvent(orgId: string, eventId: string, actor: DeleteEventActor): Promise<DeleteEventResult>;

  // The Athlete's Spot Request becomes pending. athleteId comes from the session
  requestSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<RequestSpotResult>;

  // The Athlete's Spot Request becomes withdrawn. The row stays: asking again
  // reuses it
  withdrawSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<WithdrawSpotResult>;

  // A pending Spot Request becomes approved, and the Athlete becomes an active
  // participant of the Event's chat. athleteId is the one the Manager chose
  // from EventManagerView.spotRequests
  approveSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<ReviewSpotResult>;

  // The Events of the club that start in [from, to): from included, to left out,
  // so two weeks in a row never share an Event. Ordered by startsAt, cancelled
  // ones included, no size limit. For members, Managers and the Admin alike
  listEvents(
    orgId: string,
    viewerId: string,
    range: { from: Date; to: Date },
  ): Promise<EventMemberView[]>;

  // null: the Event does not exist or is from another club
  getEventForMember(
    orgId: string,
    eventId: string,
    viewerId: string,
  ): Promise<EventMemberView | null>;

  // The only read that says who asked: the Spot Requests with their nick, oldest
  // first. The caller checks event.readAttendees. null: does not exist or another club
  getEventForManager(orgId: string, eventId: string): Promise<EventManagerView | null>;

  // The only operation without orgId: it finds the club, so findOrgResource +
  // requireOrgResource can check the permission. findOrgResource already turns a
  // malformed id into null before calling it. null: no Event with that id
  findEventOrg(eventId: string): Promise<{ id: string; orgId: string } | null>;
}

// What every read of an Event selects: its own fields and how many spots are
// approved, as a COUNT in Postgres: how many, never who (#2).
// satisfies checks it is a valid select but keeps its exact type, so Prisma
// still knows which fields come back. A ": Prisma.EventSelect" would lose that
const EVENT_FIELDS = {
  id: true,
  orgId: true,
  title: true,
  location: true,
  startsAt: true,
  sessionId: true,
  cancelledAt: true,
  _count: { select: { spotRequests: { where: { status: "approved" } } } },
} satisfies Prisma.EventSelect;

// What listEvents and getEventForMember read: the shared fields plus the
// viewer's own Spot Request (0 or 1 rows, the key is (event_id, user_id))
function memberSelect(viewerId: string) {
  return {
    ...EVENT_FIELDS,
    spotRequests: { where: { userId: viewerId }, select: { status: true } },
  } satisfies Prisma.EventSelect;
}

// The row Prisma returns for that select: only the fields it asks for
type MemberRow = Prisma.EventGetPayload<{ select: ReturnType<typeof memberSelect> }>;

// Rest: fields is the row without _count and spotRequests
function toMemberView({ _count, spotRequests, ...fields }: MemberRow): EventMemberView {
  return {
    ...fields,
    approvedCount: _count.spotRequests,
    mySpotRequest: spotRequests[0]?.status ?? null,
  };
}

// The production EventRepository, on Postgres
export class PrismaEventRepository implements EventRepository {
  // The client comes in from outside, like the other repositories: a test can pass its own
  constructor(private readonly db: PrismaClient = prisma) {}

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
    if (data.sessionId !== null && !(await this.sessionIsValid(orgId, data.sessionId))) {
      return { ok: false, reason: "invalid-session" };
    }
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

  async updateEvent(
    orgId: string,
    eventId: string,
    data: EventData,
    now: Date,
  ): Promise<UpdateEventResult> {
    // The new data first, in the same order as createEvent. null: it is fine
    let dataReason: "starts-in-the-past" | "invalid-session" | null = null;
    if (data.startsAt <= now) {
      dataReason = "starts-in-the-past";
    } else if (data.sessionId !== null && !(await this.sessionIsValid(orgId, data.sessionId))) {
      dataReason = "invalid-session";
    }
    if (dataReason === null) {
      // The same compare-and-swap as cancelEvent: a cancel that lands between a
      // check and the write can never let the edit through
      const { count } = await this.db.event.updateMany({
        where: { id: eventId, orgId, cancelledAt: null, startsAt: { gt: now } },
        // Field by field and not data whole: an object may carry more fields than
        // its type says, and cancelledAt must never change here
        data: {
          title: data.title,
          location: data.location,
          startsAt: data.startsAt,
          sessionId: data.sessionId,
        },
      });
      if (count === 1) {
        return { ok: true };
      }
    }
    // Nothing written: read why. The state of the Event comes before the new
    // data in the fixed order. startsAt too: the updateMany may not have run
    const event = await this.db.event.findFirst({
      where: { id: eventId, orgId },
      select: { cancelledAt: true, startsAt: true },
    });
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: false, reason: "cancelled" };
    }
    if (event.startsAt <= now) {
      return { ok: false, reason: "started" };
    }
    if (dataReason !== null) {
      return { ok: false, reason: dataReason };
    }
    // The updateMany wrote nothing, yet every check passes: it should never happen
    throw new Error(`updateEvent wrote nothing for Event ${eventId} without a reason`);
  }

  // Whether a Session can be linked to an Event of that club: only a Template
  // Session of the Group (no athleteId) of the same club (#147, question f).
  // Shared by createEvent and updateEvent. Known limit (#238): a Session deleted
  // between this read and the write makes it throw P2003 (foreign key) instead
  // of returning invalid-session
  private async sessionIsValid(orgId: string, sessionId: string): Promise<boolean> {
    const session = await this.db.trainingSession.findFirst({
      where: { id: sessionId, orgId, origin: "template", athleteId: null },
      select: { id: true },
    });
    return session !== null;
  }

  async cancelEvent(orgId: string, eventId: string, now: Date): Promise<CancelEventResult> {
    // Check and write in one UPDATE ... WHERE, like a compare-and-swap: of two
    // cancels at the same time (a double click) only one finds cancelledAt null,
    // so the second can never overwrite the first date. updateMany and not
    // update: the where has fields that are not unique, and 0 rows is no error
    const { count } = await this.db.event.updateMany({
      where: { id: eventId, orgId, cancelledAt: null, startsAt: { gt: now } },
      data: { cancelledAt: now },
    });
    if (count === 1) {
      return { ok: true, changed: true };
    }
    // Nothing changed: read why, in the fixed order
    const event = await this.db.event.findFirst({
      where: { id: eventId, orgId },
      select: { cancelledAt: true },
    });
    if (!event) {
      return { ok: false, reason: "not-found" };
    }
    if (event.cancelledAt !== null) {
      return { ok: true, changed: false };
    }
    return { ok: false, reason: "started" };
  }

  async deleteEvent(
    orgId: string,
    eventId: string,
    actor: DeleteEventActor,
  ): Promise<DeleteEventResult> {
    // The deletion and the Admin's audit row in one transaction: if the row
    // cannot be written, the rollback brings the Event back and the error goes up
    return this.db.$transaction(async (tx): Promise<DeleteEventResult> => {
      // deleteMany and not delete: delete throws (P2025) when no row matches,
      // deleteMany returns count. Postgres deletes its chat and Spot Requests too
      // (onDelete: Cascade) and sets event_id to null in its Feedback (SetNull)
      const { count } = await tx.event.deleteMany({ where: { id: eventId, orgId } });
      if (count === 0) {
        // A deletion that did not happen is not audited
        return { ok: false, reason: "not-found" };
      }
      if (actor.kind === "admin") {
        await recordAdminAction(tx, {
          adminId: actor.adminId,
          action: "delete",
          resource: "event",
          // resource_id is a text column: Postgres would keep an upper-case id as it came.
          // The uuid columns need nothing: Postgres compares them by value and returns
          // them in lower case
          resourceId: normalizeId(eventId),
        });
      }
      return { ok: true };
    });
  }

  async requestSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<RequestSpotResult> {
    // The Event first, in the fixed order. An INSERT has no WHERE: the foreign
    // key only checks the Event exists, not that it is of this club
    const event = await this.db.event.findFirst({
      where: { id: eventId, orgId },
      select: { cancelledAt: true, startsAt: true },
    });
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
    // eventId_userId: the name Prisma gives the primary key @@id([eventId, userId])
    const existing = await this.db.spotRequest.findUnique({
      where: { eventId_userId: { eventId, userId: athleteId } },
      select: { status: true },
    });
    // Already pending or approved: a double click, nothing is written. An
    // approved Athlete keeps their spot
    if (existing?.status === "pending" || existing?.status === "approved") {
      return { ok: true, changed: false };
    }
    // createdAt is now and not the default now() of Postgres: the caller
    // chooses the moment, and the Manager's list orders by it
    if (existing === null) {
      await this.db.spotRequest.create({
        data: { eventId, userId: athleteId, status: "pending", createdAt: now },
      });
    } else {
      // Asking again after withdrawing: the same row (the key is (event_id, user_id)),
      // as a new request that goes to the end of the Manager's list
      await this.db.spotRequest.update({
        where: { eventId_userId: { eventId, userId: athleteId } },
        data: { status: "pending", createdAt: now },
      });
    }
    return { ok: true, changed: true };
  }

  async withdrawSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<WithdrawSpotResult> {
    // The Event first, in the fixed order
    const event = await this.db.event.findFirst({
      where: { id: eventId, orgId },
      select: { cancelledAt: true, startsAt: true },
    });
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
    // The state before: what to do depends on it
    const existing = await this.db.spotRequest.findUnique({
      where: { eventId_userId: { eventId, userId: athleteId } },
      select: { status: true },
    });
    if (existing === null) {
      return { ok: false, reason: "no-request" };
    }
    // Already withdrawn: a double click, nothing is written
    if (existing.status === "withdrawn") {
      return { ok: true, changed: false };
    }
    await this.db.spotRequest.update({
      where: { eventId_userId: { eventId, userId: athleteId } },
      data: { status: "withdrawn" },
    });
    return { ok: true, changed: true };
  }

  async approveSpot(
    orgId: string,
    eventId: string,
    athleteId: string,
    now: Date,
  ): Promise<ReviewSpotResult> {
    // The Event first, in the fixed order
    const event = await this.db.event.findFirst({
      where: { id: eventId, orgId },
      select: { cancelledAt: true, startsAt: true },
    });
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
    const existing = await this.db.spotRequest.findUnique({
      where: { eventId_userId: { eventId, userId: athleteId } },
      select: { status: true },
    });
    if (existing === null) {
      return { ok: false, reason: "no-request" };
    }
    // Already approved: a double click, or another Manager with the same decision
    if (existing.status === "approved") {
      return { ok: true, changed: false };
    }
    // Only a pending request is approved: anything else changed since the
    // Manager loaded the list
    if (existing.status !== "pending") {
      return { ok: false, reason: "status-changed" };
    }
    // findUnique: event_id is unique in conversations, one chat per Event
    const chat = await this.db.conversation.findUnique({
      where: { eventId },
      select: { id: true },
    });
    // createEvent creates the Event and its chat together: it should never happen
    if (chat === null) {
      throw new Error(`Event ${eventId} has no chat`);
    }
    await this.db.spotRequest.update({
      where: { eventId_userId: { eventId, userId: athleteId } },
      data: { status: "approved" },
    });
    // upsert: the row may exist from an earlier approval (they withdrew and came
    // back). Then it is made active again, keeping the chat history
    await this.db.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: chat.id, userId: athleteId } },
      create: { conversationId: chat.id, userId: athleteId, removedAt: null },
      update: { removedAt: null },
    });
    return { ok: true, changed: true };
  }

  async listEvents(
    orgId: string,
    viewerId: string,
    range: { from: Date; to: Date },
  ): Promise<EventMemberView[]> {
    const events = await this.db.event.findMany({
      // gte: >= from, lt: < to. Cancelled ones too: no filter on cancelledAt
      where: { orgId, startsAt: { gte: range.from, lt: range.to } },
      orderBy: { startsAt: "asc" },
      select: memberSelect(viewerId),
    });
    // One query for the whole list: the counts come in the same SELECT
    return events.map(toMemberView);
  }

  async getEventForMember(
    orgId: string,
    eventId: string,
    viewerId: string,
  ): Promise<EventMemberView | null> {
    // findFirst and not findUnique: the where also has orgId, which is not unique.
    // Another club's Event is treated as one that does not exist
    const event = await this.db.event.findFirst({
      where: { id: eventId, orgId },
      select: memberSelect(viewerId),
    });
    if (!event) {
      return null;
    }
    return toMemberView(event);
  }

  async getEventForManager(orgId: string, eventId: string): Promise<EventManagerView | null> {
    const event = await this.db.event.findFirst({
      where: { id: eventId, orgId },
      select: {
        ...EVENT_FIELDS,
        // Every Spot Request, oldest first, with the nick through the user relation
        spotRequests: {
          orderBy: { createdAt: "asc" },
          select: { userId: true, status: true, createdAt: true, user: { select: { nick: true } } },
        },
      },
    });
    if (!event) {
      return null;
    }
    const { _count, spotRequests, ...fields } = event;
    return {
      ...fields,
      approvedCount: _count.spotRequests,
      // map: a new array with one element per row, like a for loop that fills it
      spotRequests: spotRequests.map((request) => ({
        athleteId: request.userId,
        // nick is optional in users: an empty one, as in the rest of the app
        nick: request.user.nick ?? "",
        status: request.status,
        createdAt: request.createdAt,
      })),
    };
  }

  async findEventOrg(eventId: string): Promise<{ id: string; orgId: string } | null> {
    // findUnique: the where has only the primary key. Already { id, orgId } or null
    return this.db.event.findUnique({
      where: { id: eventId },
      select: { id: true, orgId: true },
    });
  }
}
