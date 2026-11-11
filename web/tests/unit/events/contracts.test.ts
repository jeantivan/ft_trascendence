import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AthleteFeedbackView,
  EventManagerView,
  EventMemberView,
  ManagerFeedbackView,
} from "@/lib/events/contracts";

// The views are types: they vanish when compiled, so Vitest cannot see them.
// The check that matters is tsc (npm run typecheck, and the CI) on the lines below:
// each @ts-expect-error must find an error, or tsc fails with "Unused directive".

const EVENT_ID = "00000000-0000-4000-8000-000000000201";

describe("Events view contracts", () => {
  it("EventMemberView carries the count, never the list of Spot Requests", () => {
    // What the Admin gets: same view, without a Spot Request of their own
    const adminView: EventMemberView = {
      id: EVENT_ID,
      title: "Series en el Retiro",
      location: "Puerta de Alcalá",
      startsAt: new Date("2026-11-14T08:00:00Z"),
      sessionId: null,
      cancelledAt: null,
      approvedCount: 3,
      mySpotRequest: null,
    };

    const withNames: EventMemberView = {
      ...adminView,
      // @ts-expect-error a member never sees who is coming, only how many (#2)
      spotRequests: [],
    };

    // At runtime they are plain objects
    for (const view of [adminView, withNames]) {
      expect(view).toBeDefined();
    }
  });

  it("EventMemberView has exactly these fields: a new one needs a review against #2", () => {
    expectTypeOf<keyof EventMemberView>().toEqualTypeOf<
      | "id"
      | "title"
      | "location"
      | "startsAt"
      | "sessionId"
      | "cancelledAt"
      | "approvedCount"
      | "mySpotRequest"
    >();
  });

  it("EventManagerView adds the Spot Requests with nick and status", () => {
    const managerView: EventManagerView = {
      id: EVENT_ID,
      title: "Series en el Retiro",
      location: "Puerta de Alcalá",
      startsAt: new Date("2026-11-14T08:00:00Z"),
      sessionId: null,
      cancelledAt: null,
      approvedCount: 1,
      spotRequests: [
        {
          userId: "00000000-0000-4000-8000-000000000023",
          nick: "ana",
          status: "approved",
          createdAt: new Date("2026-11-10T18:00:00Z"),
        },
      ],
    };

    const withOwnRequest: EventManagerView = {
      ...managerView,
      // @ts-expect-error a Manager has no Spot Request in their own club
      mySpotRequest: null,
    };

    for (const view of [managerView, withOwnRequest]) {
      expect(view).toBeDefined();
    }
  });

  it("EventManagerView has exactly these fields", () => {
    expectTypeOf<keyof EventManagerView>().toEqualTypeOf<
      | "id"
      | "title"
      | "location"
      | "startsAt"
      | "sessionId"
      | "cancelledAt"
      | "approvedCount"
      | "spotRequests"
    >();
    expectTypeOf<keyof EventManagerView["spotRequests"][number]>().toEqualTypeOf<
      "userId" | "nick" | "status" | "createdAt"
    >();
  });
});

describe("Feedback view contracts", () => {
  const body = "Buen ritmo en las series; la próxima vez, más calentamiento.";

  it("AthleteFeedbackView keeps the Feedback when the Event or the Manager is gone", () => {
    // The Event was deleted and the Manager deleted their account: the Athlete keeps it
    const orphan: AthleteFeedbackView = {
      id: "00000000-0000-4000-8000-000000000301",
      eventId: null,
      managerNick: null,
      body,
      createdAt: new Date("2026-11-14T12:00:00Z"),
    };

    expect(orphan).toBeDefined();
    // A nick to show, never the Manager's id (#2)
    expectTypeOf<keyof AthleteFeedbackView>().toEqualTypeOf<
      "id" | "eventId" | "managerNick" | "body" | "createdAt"
    >();
  });

  it("ManagerFeedbackView always has its Event and no author: it is always the Manager", () => {
    const written: ManagerFeedbackView = {
      id: "00000000-0000-4000-8000-000000000301",
      eventId: EVENT_ID,
      athleteId: "00000000-0000-4000-8000-000000000023",
      athleteNick: "ana",
      body,
      createdAt: new Date("2026-11-14T12:00:00Z"),
    };

    const withoutEvent: ManagerFeedbackView = {
      ...written,
      // @ts-expect-error the Manager reads it from the Event, so the Event exists
      eventId: null,
    };

    for (const view of [written, withoutEvent]) {
      expect(view).toBeDefined();
    }
    expectTypeOf<keyof ManagerFeedbackView>().toEqualTypeOf<
      "id" | "eventId" | "athleteId" | "athleteNick" | "body" | "createdAt"
    >();
  });
});
