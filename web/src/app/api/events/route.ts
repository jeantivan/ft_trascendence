// GET /api/events: the one SSE stream per browser tab (ADR 0001).
// Sends a heartbeat and every event the hub dispatches.

import { subscribe } from "@/lib/events/hub";
import { ensureListener } from "@/lib/events/listener";
import { requireApiAuth } from "@/lib/permissions/require-api-auth";

// pg (LISTEN/NOTIFY) needs Node APIs, so this route cannot run on Edge.
export const runtime = "nodejs";

const PING_INTERVAL_MS = 15_000;

const encoder = new TextEncoder();

export async function GET(request: Request) {
  // The proxy only checks the JWT; this checks the user in the database
  const auth = await requireApiAuth();
  if (auth instanceof Response) {
    return auth;
  }

  await ensureListener();
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let closed = false;

  // Stops everything this stream started, so a closed tab leaves nothing behind.
  function cleanup() {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(pingTimer);
    if (unsubscribe) {
      unsubscribe();
    }
    request.signal.removeEventListener("abort", cleanup);
    try {
      if (streamController) {
        streamController.close();
      }
    } catch {
      // Already closed or cancelled by the client: nothing to do
    }
  }

  // A failed enqueue means this stream is gone: clean it up instead of throwing,
  // or the hub would stop delivering the event to the other streams.
  function send(text: string) {
    try {
      if (streamController) {
        streamController.enqueue(encoder.encode(text));
      }
    } catch {
      cleanup();
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      // The client may have left already: then "abort" will never fire, so stop here.
      if (request.signal.aborted) {
        cleanup();
        return;
      }
      // Lines starting with ":" are SSE comments: the browser ignores them,
      // but they keep proxies from closing an idle connection.
      send(": connected\n\n");
      pingTimer = setInterval(() => {
        send(": ping\n\n");
      }, PING_INTERVAL_MS);

      unsubscribe = subscribe((event) => {
        const message = `event: ${event.channel}\ndata: ${JSON.stringify(event.payload)}\n\n`;
        send(message);
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
      "X-Accel-Buffering": "no",
    },
  });
}
