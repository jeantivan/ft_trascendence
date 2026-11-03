import { z } from "zod";

// Loads a resource by the id that came in the URL or the request, before
// requireOrgResource / requireApiOrgResource. A malformed id gives null without
// touching the database (Prisma would throw P2023 → 500), so it ends in the
// same 404 as a missing resource. find must select orgId: the role check needs
// the resource's club. The lookup runs before the session check, because the
// club is unknown until the resource is loaded; a visitor still gets the same
// redirect whether the id exists or not.
// Usage:
//   const group = await findOrgResource(params.id, (id) =>
//     prisma.group.findUnique({ where: { id }, select: { id: true, orgId: true } }));
//   const { resource, user } = await requireOrgResource(group, ORG_ROLES["group.write"]);
export async function findOrgResource<T extends { orgId: string }>(
  id: string,
  find: (id: string) => Promise<T | null>
): Promise<T | null> {
  // z.guid(), not z.uuid(): any 8-4-4-4-12 hex id, like Postgres (z.uuid() rejects the seed's 00000000-...-0001)
  if (!z.guid().safeParse(id).success) {
    return null;
  }
  return find(id);
}
