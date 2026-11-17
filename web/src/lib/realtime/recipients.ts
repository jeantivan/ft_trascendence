// Decides whether an SSE stream gets an event (ADR 0001): a notification
// only reaches its own user. Other channels still reach everyone (not filtered yet).

import { RealtimeEvent } from "@/lib/realtime/hub";

export function isRecipient(event: RealtimeEvent, userId: string) {
  if (event.channel === "notification") {
    return event.payload.userId === userId;
  }
  return true;
}