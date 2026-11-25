// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { orderedPair } from "@/lib/social/contact-pair";
import { cancelPendingContactsWithoutSharedGroup } from "@/lib/social/cancel-pending-contacts";

const PREFIX = "cancel-pending-";
let counter = 0;

// Three users sorted by id: the middle one is userB of a Contact with the first and userA with the last
async function createUsers(): Promise<[string, string, string]> {
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const user = await prisma.user.create({ data: { email: `${PREFIX}${counter++}@example.com` } });
    ids.push(user.id);
  }
  ids.sort();
  return [ids[0], ids[1], ids[2]];
}

// A club with one Group holding these users
async function createGroup(userIds: string[]) {
  await prisma.organization.create({
    data: {
      name: `${PREFIX}${counter++}`,
      timezone: "Europe/Madrid",
      groups: { create: { name: "Group", members: { create: userIds.map((userId) => ({ userId })) } } },
    },
  });
}

async function createContact(requestedBy: string, other: string, status: "pending" | "accepted") {
  await prisma.contact.create({ data: { ...orderedPair(requestedBy, other), requestedBy, status } });
}

function cancel(userId: string): Promise<number> {
  return prisma.$transaction((tx) => cancelPendingContactsWithoutSharedGroup(tx, userId));
}

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("cancelPendingContactsWithoutSharedGroup", () => {
  it("deletes the pending Contacts with no shared Group, whether the user is userA or userB", async () => {
    const [low, me, high] = await createUsers();
    await createContact(low, me, "pending");
    await createContact(me, high, "pending");

    expect(await cancel(me)).toBe(2);
    expect(await prisma.contact.count({ where: { OR: [{ userA: me }, { userB: me }] } })).toBe(0);
  });

  it("keeps a pending Contact that still shares a Group and every accepted Contact", async () => {
    const [low, me, high] = await createUsers();
    await createGroup([me, high]);
    await createContact(low, me, "accepted");
    await createContact(me, high, "pending");

    expect(await cancel(me)).toBe(0);
    expect(await prisma.contact.count({ where: { OR: [{ userA: me }, { userB: me }] } })).toBe(2);
  });
});
