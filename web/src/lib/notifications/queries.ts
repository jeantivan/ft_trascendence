// Queries on the notifications table: each one only touches the given user's rows

import { prisma } from "@/lib/prisma";

export async function listOwnNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId: userId },
    orderBy: { id: "desc" },
    take: 50,
    select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
  });
}

export async function markNotificationRead(userId: string, notificationId: bigint) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId: userId },
    data: { readAt: new Date() },
  });
  return result.count;
}