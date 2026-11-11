import { describe, expect, it } from "vitest";
import {
  cancelEventSchema,
  createEventSchema,
  createFeedbackSchema,
  deleteFeedbackSchema,
  requestSpotSchema,
  reviewSpotSchema,
  spotRequestStatusSchema,
  updateEventSchema,
  updateFeedbackSchema,
  withdrawSpotSchema,
} from "@/lib/events/schemas";

const EVENT_ID = "00000000-0000-4000-8000-000000000201";

// A valid Event: each test changes only the field it is about
const validEvent = {
  title: "Series en el Retiro",
  location: "Puerta de Alcalá",
  startsAt: "2026-11-14T09:00",
  sessionId: null,
};

describe("Events Zod schemas", () => {
  describe("createEventSchema", () => {
    it("accepts a valid Event", () => {
      const result = createEventSchema.safeParse(validEvent);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        title: "Series en el Retiro",
        location: "Puerta de Alcalá",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
      });
    });

    it("trims spaces around title and location", () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        title: "  Series en el Retiro  ",
        location: " Puerta de Alcalá ",
      });

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe("Series en el Retiro");
      expect(result.data?.location).toBe("Puerta de Alcalá");
    });

    it("rejects a title made only of spaces", () => {
      expect(createEventSchema.safeParse({ ...validEvent, title: "   " }).success).toBe(false);
    });

    it("rejects a location made only of spaces", () => {
      expect(createEventSchema.safeParse({ ...validEvent, location: "   " }).success).toBe(false);
    });

    it("accepts a title of 100 characters and rejects one of 101", () => {
      expect(createEventSchema.safeParse({ ...validEvent, title: "a".repeat(100) }).success).toBe(true);
      expect(createEventSchema.safeParse({ ...validEvent, title: "a".repeat(101) }).success).toBe(false);
    });

    it("accepts a location of 200 characters and rejects one of 201", () => {
      expect(createEventSchema.safeParse({ ...validEvent, location: "a".repeat(200) }).success).toBe(true);
      expect(createEventSchema.safeParse({ ...validEvent, location: "a".repeat(201) }).success).toBe(false);
    });

    it("rejects a startsAt that is not an existing YYYY-MM-DDTHH:mm", () => {
      // February 31st does not exist
      expect(createEventSchema.safeParse({ ...validEvent, startsAt: "2026-02-31T09:00" }).success).toBe(false);
      // With seconds
      expect(createEventSchema.safeParse({ ...validEvent, startsAt: "2026-11-14T09:00:00" }).success).toBe(false);
      // A space instead of the T
      expect(createEventSchema.safeParse({ ...validEvent, startsAt: "2026-11-14 09:00" }).success).toBe(false);
    });

    it("rejects a startsAt with a time zone, since it is the club's wall clock", () => {
      expect(createEventSchema.safeParse({ ...validEvent, startsAt: "2026-11-14T09:00Z" }).success).toBe(false);
      expect(createEventSchema.safeParse({ ...validEvent, startsAt: "2026-11-14T09:00+01:00" }).success).toBe(
        false,
      );
    });

    it("accepts a sessionId in the seed's format and rejects a malformed one", () => {
      const seedLikeId = "00000000-0000-4000-8000-000000000101";

      expect(createEventSchema.safeParse({ ...validEvent, sessionId: seedLikeId }).success).toBe(true);
      expect(createEventSchema.safeParse({ ...validEvent, sessionId: "abc" }).success).toBe(false);
    });

    it("drops orgId, createdBy and cancelledAt sent by the client", () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        orgId: "00000000-0000-4000-8000-000000000001",
        createdBy: "00000000-0000-4000-8000-000000000022",
        cancelledAt: "2026-11-13T10:00",
      });

      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty("orgId");
      expect(result.data).not.toHaveProperty("createdBy");
      expect(result.data).not.toHaveProperty("cancelledAt");
    });

    describe("error messages, shown in the form", () => {
      // The message of the first problem found
      function messageFor(input: Record<string, unknown>) {
        return createEventSchema.safeParse(input).error?.issues[0]?.message;
      }

      it("explains an empty or too long title", () => {
        expect(messageFor({ ...validEvent, title: "   " })).toBe("El título no puede estar vacío");
        expect(messageFor({ ...validEvent, title: "a".repeat(101) })).toBe(
          "El título no puede superar los 100 caracteres",
        );
      });

      it("explains an empty or too long location", () => {
        expect(messageFor({ ...validEvent, location: "   " })).toBe("El lugar no puede estar vacío");
        expect(messageFor({ ...validEvent, location: "a".repeat(201) })).toBe(
          "El lugar no puede superar los 200 caracteres",
        );
      });

      it("explains an invalid startsAt, whichever rule catches it", () => {
        // Caught by the date check
        expect(messageFor({ ...validEvent, startsAt: "2026-02-31T09:00" })).toBe("Fecha y hora no válidas");
        // Caught by the regex
        expect(messageFor({ ...validEvent, startsAt: "2026-11-14T09:00Z" })).toBe("Fecha y hora no válidas");
      });
    });
  });

  describe("updateEventSchema", () => {
    const valid = { eventId: EVENT_ID, ...validEvent };

    it("accepts a valid edit with its eventId", () => {
      const result = updateEventSchema.safeParse(valid);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(valid);
    });

    it("rejects an edit without an eventId or with a malformed one", () => {
      expect(updateEventSchema.safeParse({ ...valid, eventId: undefined }).success).toBe(false);
      expect(updateEventSchema.safeParse({ ...valid, eventId: "abc" }).success).toBe(false);
    });

    it("drops cancelledAt, so an edit cannot cancel or uncancel", () => {
      const result = updateEventSchema.safeParse({ ...valid, cancelledAt: null });

      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty("cancelledAt");
    });
  });

  describe("cancelEventSchema", () => {
    it("takes only the eventId: the server sets cancelledAt", () => {
      const result = cancelEventSchema.safeParse({
        eventId: EVENT_ID,
        cancelledAt: "2026-11-01T10:00",
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ eventId: EVENT_ID });
    });

    it("rejects a malformed eventId", () => {
      expect(cancelEventSchema.safeParse({ eventId: "abc" }).success).toBe(false);
    });
  });

  describe("spotRequestStatusSchema", () => {
    it("accepts the four states of a Spot Request and nothing else", () => {
      for (const status of ["pending", "approved", "rejected", "withdrawn"]) {
        expect(spotRequestStatusSchema.safeParse(status).success).toBe(true);
      }
      expect(spotRequestStatusSchema.safeParse("cancelled").success).toBe(false);
    });
  });

  // The Athlete comes from the session, never from the client
  describe.each([
    ["requestSpotSchema", requestSpotSchema],
    ["withdrawSpotSchema", withdrawSpotSchema],
  ])("%s", (_name, schema) => {
    it("takes only the eventId and drops a userId sent by the client", () => {
      const result = schema.safeParse({
        eventId: EVENT_ID,
        userId: "00000000-0000-4000-8000-000000000024",
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ eventId: EVENT_ID });
    });

    it("rejects a malformed eventId", () => {
      expect(schema.safeParse({ eventId: "abc" }).success).toBe(false);
    });
  });

  describe("reviewSpotSchema", () => {
    const valid = {
      eventId: EVENT_ID,
      userId: "00000000-0000-4000-8000-000000000024",
      decision: "approved",
    };

    it("accepts approving or rejecting a Spot Request", () => {
      expect(reviewSpotSchema.safeParse(valid).success).toBe(true);
      expect(reviewSpotSchema.safeParse({ ...valid, decision: "rejected" }).success).toBe(true);
    });

    it("rejects any other decision: the Manager only approves or rejects", () => {
      expect(reviewSpotSchema.safeParse({ ...valid, decision: "pending" }).success).toBe(false);
      expect(reviewSpotSchema.safeParse({ ...valid, decision: "withdrawn" }).success).toBe(false);
    });

    it("rejects a malformed userId", () => {
      expect(reviewSpotSchema.safeParse({ ...valid, userId: "abc" }).success).toBe(false);
    });
  });

  describe("createFeedbackSchema", () => {
    const valid = {
      eventId: EVENT_ID,
      athleteId: "00000000-0000-4000-8000-000000000024",
      body: "Buen ritmo en las series; la próxima vez, más calentamiento.",
    };

    it("accepts a valid Feedback and trims its body", () => {
      const result = createFeedbackSchema.safeParse({ ...valid, body: `  ${valid.body}  ` });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(valid);
    });

    it("rejects a malformed eventId or athleteId", () => {
      expect(createFeedbackSchema.safeParse({ ...valid, eventId: "abc" }).success).toBe(false);
      expect(createFeedbackSchema.safeParse({ ...valid, athleteId: "abc" }).success).toBe(false);
    });

    it("explains an empty or too long body", () => {
      const empty = createFeedbackSchema.safeParse({ ...valid, body: "   " });
      const tooLong = createFeedbackSchema.safeParse({ ...valid, body: "a".repeat(2001) });

      expect(empty.error?.issues[0]?.message).toBe("El Feedback no puede estar vacío");
      expect(tooLong.error?.issues[0]?.message).toBe(
        "El Feedback no puede superar los 2000 caracteres",
      );
      // 2000 is still fine
      expect(createFeedbackSchema.safeParse({ ...valid, body: "a".repeat(2000) }).success).toBe(true);
    });

    it("never repeats the body in the error: it is health data", () => {
      const healthText = "Me duele la rodilla izquierda. ".repeat(70);
      const result = createFeedbackSchema.safeParse({ ...valid, body: healthText });

      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error)).not.toContain("rodilla");
    });
  });

  describe("updateFeedbackSchema", () => {
    const FEEDBACK_ID = "00000000-0000-4000-8000-000000000301";

    it("takes the feedbackId and the new body, and drops eventId and athleteId", () => {
      const result = updateFeedbackSchema.safeParse({
        feedbackId: FEEDBACK_ID,
        body: "  Mejor así: más calentamiento.  ",
        eventId: EVENT_ID,
        athleteId: "00000000-0000-4000-8000-000000000023",
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ feedbackId: FEEDBACK_ID, body: "Mejor así: más calentamiento." });
    });

    it("applies the same body rules as creating", () => {
      const message = updateFeedbackSchema.safeParse({ feedbackId: FEEDBACK_ID, body: "   " }).error
        ?.issues[0]?.message;

      expect(message).toBe("El Feedback no puede estar vacío");
    });
  });

  describe("deleteFeedbackSchema", () => {
    it("takes only a well-formed feedbackId", () => {
      const FEEDBACK_ID = "00000000-0000-4000-8000-000000000301";

      expect(deleteFeedbackSchema.safeParse({ feedbackId: FEEDBACK_ID }).data).toEqual({
        feedbackId: FEEDBACK_ID,
      });
      expect(deleteFeedbackSchema.safeParse({ feedbackId: "abc" }).success).toBe(false);
    });
  });
});
