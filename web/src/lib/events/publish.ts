// The one function the rest of the app uses to emit realtime events (ADR 0001).
// Call it inside the same transaction that writes the data: pg_notify is only sent
// on commit, so a rolled-back write never announces anything.
// The payload carries only ids (never content, RPE or Feedback); send BigInt ids as strings.

import { Prisma } from "@/generated/prisma/client";
import { RealtimeEvent } from "@/lib/events/hub";

export async function publish(
    tx: Prisma.TransactionClient,
    channel: string,
    payload: RealtimeEvent["payload"],
) {
    const message = JSON.stringify({ channel, payload });
    // Tagged template: Prisma sends message as a bind parameter, so it cannot inject SQL.
    await tx.$executeRaw`SELECT pg_notify('ft_events', ${message})`;
}