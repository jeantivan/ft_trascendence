// GET /api/events: the one SSE stream per browser tab (ADR 0001).
// For now it only sends a heartbeat; real events come in later steps.

// pg (LISTEN/NOTIFY) needs Node APIs, so this route cannot run on Edge.
export const runtime = "nodejs";

const PING_INTERVAL_MS = 15_000;

// Convert to UTF-8.
const encoder = new TextEncoder();

export async function GET(request: Request) {
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  function stopPing() {
    clearInterval(pingTimer);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Lines starting with ":" are SSE comments: the browser ignores them,
      // but they keep proxies from closing an idle connection.
      controller.enqueue(encoder.encode(": connected\n\n"));
      pingTimer = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, PING_INTERVAL_MS);
    },
    // Called when the client stops reading (tab closed, network lost).
    cancel() {
      stopPing();
    },
  });

  // Some disconnects only show up as an aborted request, so listen to both.
  request.signal.addEventListener("abort", stopPing);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
