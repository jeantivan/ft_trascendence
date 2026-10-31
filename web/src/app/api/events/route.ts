// GET /api/events: the one SSE stream per browser tab (ADR 0001).
// Sends a heartbeat and every event the hub dispatches.

import { subscribe } from "@/lib/events/hub";
import { ensureListener } from "@/lib/events/listener";

// pg (LISTEN/NOTIFY) needs Node APIs, so this route cannot run on Edge.
export const runtime = "nodejs";

const PING_INTERVAL_MS = 15_000;

// Convert to UTF-8.
const encoder = new TextEncoder();

export async function GET(request: Request) {
  await ensureListener();
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  // Stops everything this stream started, so a closed tab leaves nothing behind.
  function cleanup() {
    clearInterval(pingTimer);
    if (unsubscribe) {
      unsubscribe();
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Lines starting with ":" are SSE comments: the browser ignores them,
      // but they keep proxies from closing an idle connection.
      controller.enqueue(encoder.encode(": connected\n\n"));
      pingTimer = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, PING_INTERVAL_MS);

      unsubscribe = subscribe((event) => {
        const message = `event: ${event.channel}\ndata: ${JSON.stringify(event.payload)}\n\n`;
        controller.enqueue(encoder.encode(message));
      });
    },
    // Called when the client stops reading (tab closed, network lost).
    cancel() {
      cleanup();
    },
  });

  // Some disconnects only show up as an aborted request, so listen to both.
  request.signal.addEventListener("abort", cleanup);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
