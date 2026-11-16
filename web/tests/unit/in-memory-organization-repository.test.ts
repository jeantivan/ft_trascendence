import { randomUUID } from "node:crypto";
import { runOrganizationRepositoryContract } from "../support/organization-repository-contract";
import { InMemoryOrganizationRepository } from "../support/in-memory-organization-repository";

runOrganizationRepositoryContract("in memory", () => {
  const repo = new InMemoryOrganizationRepository();
  return {
    repo,
    createClub: async (club) => repo.add(club),
    createUsers: async (count) =>
      Array.from({ length: count }, () => {
        const id = randomUUID();
        repo.addUser(id);
        return id;
      }),
    createAdmins: async (count) =>
      Array.from({ length: count }, () => {
        const id = randomUUID();
        repo.addAdmin(id);
        return id;
      }),
    addAthlete: async (orgId, userId) => repo.addAthlete(orgId, userId),
  };
});
