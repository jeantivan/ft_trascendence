import { describe, expect, it } from "vitest";
import {
  cancelEventSchema,
  createEventSchema,
  requestSpotSchema,
  reviewSpotSchema,
  spotRequestStatusSchema,
  updateEventSchema,
  withdrawSpotSchema,
} from "@/lib/events/schemas";

const EVENT_ID = "00000000-0000-4000-8000-000000000201";

describe("Events Zod schemas", () => {
  describe("createEventSchema", () => {
    it("accepts a valid Event", () => {
      const result = createEventSchema.safeParse({
        title: "Series en el Retiro",
        location: "Puerta de Alcalá",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
      });

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
        title: "  Series en el Retiro  ",
        location: " Puerta de Alcalá ",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
      });

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe("Series en el Retiro");
      expect(result.data?.location).toBe("Puerta de Alcalá");
    });

    it("rejects a title made only of spaces", () => {
      const result = createEventSchema.safeParse({
        title: "   ",
        location: "Puerta de Alcalá",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
      });

      expect(result.success).toBe(false);
    });

    it("rejects a location made only of spaces", () => {
      const result = createEventSchema.safeParse({
        title: "Series en el Retiro",
        location: "   ",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
      });

      expect(result.success).toBe(false);
    });

    it("accepts a title of 100 characters and rejects one of 101", () => {
      const base = {
        location: "Puerta de Alcalá",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
      };

      expect(createEventSchema.safeParse({ ...base, title: "a".repeat(100) }).success).toBe(true);
      expect(createEventSchema.safeParse({ ...base, title: "a".repeat(101) }).success).toBe(false);
    });

    it("accepts a location of 200 characters and rejects one of 201", () => {
      const base = {
        title: "Series en el Retiro",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
      };

      expect(createEventSchema.safeParse({ ...base, location: "a".repeat(200) }).success).toBe(true);
      expect(createEventSchema.safeParse({ ...base, location: "a".repeat(201) }).success).toBe(false);
    });

    it("rejects a startsAt that is not an existing YYYY-MM-DDTHH:mm", () => {
      const base = {
        title: "Series en el Retiro",
        location: "Puerta de Alcalá",
        sessionId: null,
      };

      // February 31st does not exist
      expect(createEventSchema.safeParse({ ...base, startsAt: "2026-02-31T09:00" }).success).toBe(false);
      // With seconds
      expect(createEventSchema.safeParse({ ...base, startsAt: "2026-11-14T09:00:00" }).success).toBe(false);
      // A space instead of the T
      expect(createEventSchema.safeParse({ ...base, startsAt: "2026-11-14 09:00" }).success).toBe(false);
    });

    it("rejects a startsAt with a time zone, since it is the club's wall clock", () => {
      const base = {
        title: "Series en el Retiro",
        location: "Puerta de Alcalá",
        sessionId: null,
      };

      expect(createEventSchema.safeParse({ ...base, startsAt: "2026-11-14T09:00Z" }).success).toBe(false);
      expect(createEventSchema.safeParse({ ...base, startsAt: "2026-11-14T09:00+01:00" }).success).toBe(false);
    });

    it("accepts a sessionId in the seed's format and rejects a malformed one", () => {
      const base = {
        title: "Series en el Retiro",
        location: "Puerta de Alcalá",
        startsAt: "2026-11-14T09:00",
      };

      const seedLikeId = "00000000-0000-4000-8000-000000000101";
      expect(createEventSchema.safeParse({ ...base, sessionId: seedLikeId }).success).toBe(true);
      expect(createEventSchema.safeParse({ ...base, sessionId: "abc" }).success).toBe(false);
    });

    it("drops orgId, createdBy and cancelledAt sent by the client", () => {
      const result = createEventSchema.safeParse({
        title: "Series en el Retiro",
        location: "Puerta de Alcalá",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
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
      const valid = {
        title: "Series en el Retiro",
        location: "Puerta de Alcalá",
        startsAt: "2026-11-14T09:00",
        sessionId: null,
      };

      // The message of the first problem found
      function messageFor(input: Record<string, unknown>) {
        return createEventSchema.safeParse(input).error?.issues[0]?.message;
      }

      it("explains an empty or too long title", () => {
        expect(messageFor({ ...valid, title: "   " })).toBe("El título no puede estar vacío");
        expect(messageFor({ ...valid, title: "a".repeat(101) })).toBe(
          "El título no puede superar los 100 caracteres",
        );
      });

      it("explains an empty or too long location", () => {
        expect(messageFor({ ...valid, location: "   " })).toBe("El lugar no puede estar vacío");
        expect(messageFor({ ...valid, location: "a".repeat(201) })).toBe(
          "El lugar no puede superar los 200 caracteres",
        );
      });

      it("explains an invalid startsAt, whichever rule catches it", () => {
        // Caught by the date check
        expect(messageFor({ ...valid, startsAt: "2026-02-31T09:00" })).toBe("Fecha y hora no válidas");
        // Caught by the regex
        expect(messageFor({ ...valid, startsAt: "2026-11-14T09:00Z" })).toBe("Fecha y hora no válidas");
      });
    });
  });

  describe("updateEventSchema", () => {
    const valid = {
      eventId: EVENT_ID,
      title: "Series en el Retiro",
      location: "Puerta de Alcalá",
      startsAt: "2026-11-14T09:00",
      sessionId: null,
    };

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
});
