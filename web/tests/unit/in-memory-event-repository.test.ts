import { randomUUID } from "node:crypto";
import { runEventRepositoryContract } from "../support/event-repository-contract";
import { InMemoryEventRepository } from "../support/in-memory-event-repository";

// In memory there are no foreign keys: a club or a user is just a new id
runEventRepositoryContract("in memory", () => {
  const repo = new InMemoryEventRepository();
  return {
    repo,
    createClub: async () => randomUUID(),
    addManager: async () => randomUUID(),
    addAthlete: async () => randomUUID(),
    addSession: async (orgId, session) => repo.addSession(orgId, session),
    addSpotRequest: async (eventId, userId, status) => repo.addSpotRequest(eventId, userId, status),
  };
});
