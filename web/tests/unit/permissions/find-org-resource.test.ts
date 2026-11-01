import { describe, expect, it, vi } from "vitest";
import { findOrgResource } from "@/lib/permissions/find-org-resource";

const CLUB = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const GROUP_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";

// Like prisma.group.findUnique on a @db.Uuid column, which throws P2023 for a malformed id
function findGroupIn(groups: { id: string; orgId: string; name: string }[]) {
  return async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new Error("P2023: malformed UUID");
    }
    return groups.find((group) => group.id === id) ?? null;
  };
}

describe("findOrgResource", () => {
  it("returns null without asking the database when the id is not a UUID", async () => {
    // A malformed id in the URL must end in 404, not in a database error (500)
    const find = vi.fn(findGroupIn([]));

    const group = await findOrgResource("not-a-uuid", find);

    expect(group).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("returns null when no resource has that id", async () => {
    const group = await findOrgResource(GROUP_ID, findGroupIn([]));

    expect(group).toBeNull();
  });

  it("returns the resource with its club when the id exists", async () => {
    const stored = { id: GROUP_ID, orgId: CLUB, name: "Maratón A" };

    const group = await findOrgResource(GROUP_ID, findGroupIn([stored]));

    expect(group).toEqual(stored);
  });
});
