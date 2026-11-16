import { describe, expect, it } from "vitest";
import type { EventData, EventRepository } from "@/lib/events/event-repository";

// A fixed "now", so no test depends on the clock
const NOW = new Date("2030-01-01T10:00:00.000Z");
const TOMORROW = new Date("2030-01-02T10:00:00.000Z");

// What each implementation gives the contract: the repository, and a way to put
// in it what the interface cannot create yet (a real database needs real rows)
export interface EventFixture {
  repo: EventRepository;
  // A new club, empty
  createClub(): Promise<string>;
  // A new user who is a Manager or an Athlete of that club; returns their id
  addManager(orgId: string): Promise<string>;
  addAthlete(orgId: string): Promise<string>;
}

function eventData(overrides: Partial<EventData> = {}): EventData {
  return {
    title: "Rodaje suave",
    location: "Parque del Retiro",
    startsAt: TOMORROW,
    sessionId: null,
    ...overrides,
  };
}

// Rules every EventRepository must follow
export function runEventRepositoryContract(name: string, createFixture: () => EventFixture) {
  describe(`EventRepository contract: ${name}`, () => {
    it("a created Event reads back for a member with no approved spots and no request of their own", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgId = await createClub();
      const managerId = await addManager(orgId);
      const athleteId = await addAthlete(orgId);
      const data = eventData();

      const created = await repo.createEvent(orgId, managerId, data, NOW);
      const view = await repo.getEventForMember(orgId, created.eventId, athleteId);

      expect(view).toEqual({
        id: created.eventId,
        orgId,
        title: data.title,
        location: data.location,
        startsAt: data.startsAt,
        sessionId: null,
        cancelledAt: null,
        approvedCount: 0,
        mySpotRequest: null,
      });
    });

    it("an Event of another club reads as if it did not exist", async () => {
      const { repo, createClub, addManager, addAthlete } = createFixture();
      const orgA = await createClub();
      const orgB = await createClub();
      const managerA = await addManager(orgA);
      const athleteB = await addAthlete(orgB);
      const created = await repo.createEvent(orgA, managerA, eventData(), NOW);

      await expect(repo.getEventForMember(orgB, created.eventId, athleteB)).resolves.toBeNull();
    });
  });
}
