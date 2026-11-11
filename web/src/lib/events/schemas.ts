import { z } from "zod";
// enums.ts, not client.ts: only the values, no database client, so forms can import it too
import { SpotRequestStatus } from "@/generated/prisma/enums";

export const createEventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título no puede estar vacío")
    .max(100, "El título no puede superar los 100 caracteres"),
  location: z
    .string()
    .trim()
    .min(1, "El lugar no puede estar vacío")
    .max(200, "El lugar no puede superar los 200 caracteres"),
  // The club's wall clock, without a zone: the server converts it with organization.timezone.
  // The regex because local: true still accepts a final "Z"
  startsAt: z.iso
    .datetime({ local: true, precision: -1, error: "Fecha y hora no válidas" })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora no válidas"),
  sessionId: z.guid().nullable(),
});

// Every field again, not only the changed ones. Never cancelledAt: cancelling is
// its own action, so an edit cannot undo a cancellation
export const updateEventSchema = createEventSchema.extend({
  eventId: z.guid(),
});

// The server sets cancelledAt to now; there is no action to undo it
export const cancelEventSchema = z.object({
  eventId: z.guid(),
});

// From the Prisma enum: a new state in the database reaches the schema by itself
export const spotRequestStatusSchema = z.enum(SpotRequestStatus);

// Spot Request transitions. Checked and applied by EventRepository (#147) in the
// transaction; Zod only checks the shape of each action:
//   Athlete  no row or withdrawn  -> pending
//   Athlete  pending or approved  -> withdrawn
//   Manager  pending              -> approved or rejected
// rejected is final for that Event. Once the Event is cancelled or has started,
// no transition is allowed.

// The Athlete who asks or withdraws comes from the session, never from the client
export const requestSpotSchema = z.object({
  eventId: z.guid(),
});

export const withdrawSpotSchema = z.object({
  eventId: z.guid(),
});

// The Manager only decides on pending requests, and only approves or rejects
export const reviewSpotSchema = z.object({
  eventId: z.guid(),
  // The Athlete whose request is reviewed: spot_requests.user_id in the database,
  // the athleteId of EventManagerView.spotRequests[] that the Manager picked
  athleteId: z.guid(),
  decision: spotRequestStatusSchema.extract(["approved", "rejected"]),
});

// Health data: the messages are fixed texts, they never repeat what was sent
const feedbackBodySchema = z
  .string()
  .trim()
  .min(1, "El Feedback no puede estar vacío")
  .max(2000, "El Feedback no puede superar los 2000 caracteres");

// The Manager who writes comes from the session. Zod cannot check the rest, the
// service does it in the transaction: the Event has a session, has started and is
// not cancelled, the Athlete was approved and has health consent. At most one
// Feedback per Event, Athlete and Manager (the unique constraint comes in Fase 3)
export const createFeedbackSchema = z.object({
  eventId: z.guid(),
  // The Athlete who receives it
  athleteId: z.guid(),
  body: feedbackBodySchema,
});

// Only the body changes: moving a Feedback to another Event or Athlete is not an edit.
// The service checks the same conditions as creating, health consent included
export const updateFeedbackSchema = z.object({
  feedbackId: z.guid(),
  body: feedbackBodySchema,
});

export const deleteFeedbackSchema = z.object({
  feedbackId: z.guid(),
});

// What each schema returns once valid (trimmed texts), for #147 and the Server Actions
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CancelEventInput = z.infer<typeof cancelEventSchema>;
export type RequestSpotInput = z.infer<typeof requestSpotSchema>;
export type WithdrawSpotInput = z.infer<typeof withdrawSpotSchema>;
export type ReviewSpotInput = z.infer<typeof reviewSpotSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
export type DeleteFeedbackInput = z.infer<typeof deleteFeedbackSchema>;
