import type { SpotRequestStatus } from "@/generated/prisma/enums";

// What any member of the club sees of an Event, and the Admin too (#100) with
// mySpotRequest always null. Never who is coming: only how many (#2).
// approvedCount counts only approved Spot Requests (EventRepository, #147)
export type EventMemberView = {
  id: string;
  title: string;
  location: string;
  startsAt: Date;
  // null: a meetup without a Training Template
  sessionId: string | null;
  cancelledAt: Date | null;
  approvedCount: number;
  // null: no Spot Request of their own
  mySpotRequest: SpotRequestStatus | null;
};

// What a Manager of the club sees (event.readAttendees): the member view plus
// every Spot Request with who asked. No mySpotRequest: a Manager has none in
// their own club (one role per club)
export type EventManagerView = Omit<EventMemberView, "mySpotRequest"> & {
  spotRequests: {
    userId: string;
    nick: string;
    status: SpotRequestStatus;
    createdAt: Date;
  }[];
};

// Feedback is health data: only the Athlete who received it and the Manager who
// wrote it read it, never the Admin (#2). Never in logs, SSE or notifications.

// What the Athlete reads: the Feedback they received
export type AthleteFeedbackView = {
  id: string;
  // null: the Event was deleted; the Athlete keeps their history
  eventId: string | null;
  // null: the Manager deleted their account. A nick to show, never their id
  managerNick: string | null;
  body: string;
  createdAt: Date;
};

// What the Manager reads: only the Feedback they wrote, from the Event's page.
// No author field: it is always the Manager reading it
export type ManagerFeedbackView = {
  id: string;
  // Never null: without the Event the Manager has no page to read it from
  eventId: string;
  athleteId: string;
  athleteNick: string;
  body: string;
  createdAt: Date;
};
