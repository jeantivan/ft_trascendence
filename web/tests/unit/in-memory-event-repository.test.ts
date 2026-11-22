import { randomUUID } from "node:crypto";
import { runEventRepositoryContract } from "../support/event-repository-contract";
import { InMemoryEventRepository } from "../support/in-memory-event-repository";

// In memory there are no foreign keys: a club or a Manager is just a new id.
// An Athlete keeps their nick, for the Manager's list of Spot Requests
runEventRepositoryContract("in memory", () => {
  const repo = new InMemoryEventRepository();
  return {
    repo,
    createClub: async () => randomUUID(),
    addManager: async () => randomUUID(),
    addAthlete: async (_orgId, nick) => repo.addUser(nick ?? null),
    addSession: async (orgId, session) => repo.addSession(orgId, session),
    addSpotRequest: async (eventId, userId, status, createdAt) =>
      repo.addSpotRequest(eventId, userId, status, createdAt),
    chatParticipant: async (eventId, userId) => repo.chatParticipant(eventId, userId),
  };
});
