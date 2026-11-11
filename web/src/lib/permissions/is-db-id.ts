import { z } from "zod";

// Whether an id from the address or a form has the shape of a database id. A
// malformed one would make Prisma throw (500); callers treat it as "not found".
// z.guid(), not z.uuid(): any 8-4-4-4-12 hex id, like Postgres (z.uuid() rejects
// the seed's 00000000-...-0001)
export function isDbId(id: string): boolean {
  return z.guid().safeParse(id).success;
}
