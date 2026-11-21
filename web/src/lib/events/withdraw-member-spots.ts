import type { Prisma } from "@/generated/prisma/client";

// For leaving or being expelled from a club (#150): withdraws the user's pending and
// approved Spot Requests in the club's Events that have not started and are not
// cancelled, and takes them out of those chats (removedAt = now). Inside the caller's
// transaction: it does not open its own. Returns how many it withdrew
export async function withdrawMemberSpots(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  now: Date,
): Promise<number> {
  // 1. Lock those Events until the caller's commit, as lockEvent does for one Event.
  // OF e: only the events rows, not spot_requests. ORDER BY id: two exits at once
  // lock in the same order, so neither waits for the other forever (deadlock).
  // Known limit (#238): that case has no test
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT e.id
    FROM events e
    JOIN spot_requests sr ON sr.event_id = e.id
    WHERE e.org_id = ${orgId}::uuid
      AND sr.user_id = ${userId}::uuid
      AND sr.status IN ('pending', 'approved')
      AND e.starts_at > ${now}
      AND e.cancelled_at IS NULL
    ORDER BY e.id
    FOR NO KEY UPDATE OF e`;
  const eventIds = locked.map((row) => row.id);

  // 2. The requests read after the lock, not in the query above: the lock only
  // protects what is read after it. A request that another transaction changed
  // while this one waited can come back old from the JOIN
  const requests = await tx.spotRequest.findMany({
    where: { eventId: { in: eventIds }, userId, status: { in: ["pending", "approved"] } },
    select: { eventId: true, status: true },
  });

  // 3. All of them withdrawn; count is the number of rows changed
  const { count } = await tx.spotRequest.updateMany({
    where: { eventId: { in: requests.map((request) => request.eventId) }, userId },
    data: { status: "withdrawn" },
  });

  // 4. Only the approved ones were in the chat. The row stays with removedAt, so they
  // still read the history (#155), as in withdrawSpot
  const approvedEventIds = requests
    .filter((request) => request.status === "approved")
    .map((request) => request.eventId);
  await tx.conversationParticipant.updateMany({
    where: { userId, conversation: { eventId: { in: approvedEventIds } } },
    data: { removedAt: now },
  });

  return count;
}
