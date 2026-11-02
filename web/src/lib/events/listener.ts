// PG listener that dispatches events (ADR 0001).
// Reconnects on its own and sends "resync" to every stream after a reconnection.

import { Client } from "pg";
import { dispatch, RealtimeEvent } from "@/lib/events/hub";

const RETRY_DELAY_MS = 2000;

// JSON.parse returns whatever was sent: check it really is an event before dispatching.
function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const event = value as { channel?: unknown; payload?: unknown };
  return (
    typeof event.channel === "string" &&
    typeof event.payload === "object" &&
    event.payload !== null &&
    !Array.isArray(event.payload)
  );
}

// prisma does not allow LISTEN
// afterFailure: this attempt follows a failed connect or a dropped connection. Events
// published meanwhile were lost, so "resync" goes out even if we never connected before.
async function startListener(afterFailure = false) {

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  globalForListener.listenerClient = client;
  // "end" and a failed connect can both ask for a retry; only the first one counts,
  // or two clients would LISTEN and every event would arrive twice.
  let retryScheduled = false;
  function scheduleRetry() {
    // closeListener() ends the client on purpose: never reconnect then.
    if (retryScheduled || globalForListener.listenerClosing) {
      return;
    }
    retryScheduled = true;
    console.error("Listener not connected, retrying in 2 s");
    globalForListener.listenerRetryTimer = setTimeout(() => {
      startListener(true);
    }, RETRY_DELAY_MS);
  }

  client.on("notification",(msg) => {
    if (!msg.payload) {
      return;
    }
    let parsed: unknown;
    // A malformed input would lead to a crash.
    try {
      parsed = JSON.parse(msg.payload);
    } catch {
      console.error("Ignoring a malformed ft_events payload");
      return;
    }
    if (!isRealtimeEvent(parsed)) {
      console.error("Ignoring an ft_events payload that is not an event");
      return;
    }
    dispatch(parsed);
  });

  client.on("error", (err) => {
    console.error("Listener connection error:", err.message);
  });

  client.on("end", () => {
    scheduleRetry();
  });

  try {
    await client.connect();
    await client.query("LISTEN ft_events");
  } catch {
    // Listener failed to connect, retrying in 2 s
    try {
      await client.end();
    } catch {
      // Already closed: nothing to do.
    }
    scheduleRetry();
    return;
  }
  console.log("Listener connected");
  // Events published while the listener was down are lost: tell every open stream
  // to fetch its open resources again (ADR 0001).
  if (afterFailure) {
    dispatch({ channel: "resync", payload: {} });
  }
}

// The first call starts the listener and stores its Promise for later calls to reuse,
// so there is only one connection per process. globalThis survives dev reloads.
const globalForListener = globalThis as unknown as {
  listenerReady?: Promise<void>;
  listenerClient?: Client;
  listenerRetryTimer?: ReturnType<typeof setTimeout>;
  listenerClosing?: boolean;
};

// The Promise also resolves when the first connect fails: the listener keeps retrying
// in the background, so a Postgres outage never leaves the SSE streams hanging.
export function ensureListener() {
  if (!globalForListener.listenerReady) {
    globalForListener.listenerReady = startListener();
  }
  return globalForListener.listenerReady;
}

// Stops the listener and cancels a pending retry,
// closes the connection and lets the next ensureListener() start from scratch.
export async function closeListener() {
  globalForListener.listenerClosing = true;
  clearTimeout(globalForListener.listenerRetryTimer);
  const client = globalForListener.listenerClient;
  globalForListener.listenerRetryTimer = undefined;
  globalForListener.listenerClient = undefined;
  globalForListener.listenerReady = undefined;
  if (client) {
    try {
      await client.end();
    } catch {
      // Already closed: nothing to do.
    }
  }
  globalForListener.listenerClosing = false;
}