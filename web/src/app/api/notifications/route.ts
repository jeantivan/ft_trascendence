// GET /api/notifications: the user's latest notifications (ids as strings: JSON has no BigInt)

import { requireApiAuth } from "@/lib/permissions/require-api-auth";
import { listOwnNotifications } from "@/lib/notifications/queries";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth instanceof Response) {
    return auth;
  }
  const notifications = await listOwnNotifications(auth.id);
  return Response.json({
    notifications: notifications.map((notification) => ({
      id: notification.id.toString(),
      type: notification.type,
      payload: notification.payload,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    })),
  });
}