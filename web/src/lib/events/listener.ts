// PG listener that dispatches events (ADR 0001).
// Reconnects on its own and sends "resync" to every stream after a reconnection.

import { Client } from "pg";
import { dispatch, RealtimeEvent } from "@/lib/events/hub";

const RETRY_DELAY_MS = 2000;

// prisma does not allow LISTEN
async function startListener(isReconnect = false) {

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    // "end" and a failed connect can both ask for a retry; only the first one counts,
    // or two clients would LISTEN and every event would arrive twice.
    let retryScheduled = false;
    function scheduleRetry() {
        if (retryScheduled) {
            return;
        }
        retryScheduled = true;
        console.error("Listener not connected, retrying in 2 s");
        setTimeout(() => {
            startListener(true);
        }, RETRY_DELAY_MS);
    }

    client.on("notification",(msg) => {
        if (!msg.payload) {
            return;
        }
        let event: RealtimeEvent;
        // A malformed input would lead to a crash.
        try {
            event = JSON.parse(msg.payload);
        } catch {
            console.error("Ignoring a malformed ft_events payload");
            return;
        }
        dispatch(event);
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
    if (isReconnect) {
        dispatch({ channel: "resync", payload: {} });
    }
}

// The first call starts the listener and stores its Promise for later calls to reuse,
// so there is only one connection per process. globalThis survives dev reloads.
const globalForListener = globalThis as unknown as { listenerReady?: Promise<void> };

export function ensureListener() {
    if (!globalForListener.listenerReady) {
        globalForListener.listenerReady = startListener();
    }
    return globalForListener.listenerReady;
}