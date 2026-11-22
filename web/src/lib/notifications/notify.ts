// The one function the rest of the app uses in order to send notifications
// Call it inside the transaction that writes the data (ADR 0001): invalid input
// throws and rolls it all back. The payload carries only ids, never RPE or Feedback.

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { publish } from "@/lib/realtime/publish";

// Sent even when the user has notifications disabled: legal notices about the club or the account
const MANDATORY_TYPES = [
  "club_without_manager",
  "organization_deletion_scheduled",
  "organization_deletion_cancelled",
];

export const notifyInputSchema = z.strictObject({
  userId: z.guid(),
  type: z.string().min(1),
  payload: z.record(
    z.string().regex(/Id$/),
    z.union([z.guid(), z.string().regex(/^\d+$/)])
  ),
});

export type NotifyInput = z.infer<typeof notifyInputSchema>;

export async function notify(tx: Prisma.TransactionClient, input: NotifyInput) {
  const data = notifyInputSchema.parse(input);
  const user = await tx.user.findUnique({
    where: { id: data.userId },
    select: { notificationsEnabled: true },
  });
  if (user === null) {
    return null;
  }
  if (!MANDATORY_TYPES.includes(data.type)) {
    if (!user.notificationsEnabled) {
      return null;
    }
  }
  const notification = await tx.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      payload: data.payload,
    },
    select: { id: true },
  });
  await publish(tx, "notification", {
    notificationId: notification.id.toString(),
    userId: data.userId,
  });
  return notification.id;
}