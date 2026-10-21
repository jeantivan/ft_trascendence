// PG listener that dispatches events (ADR 0001).
// This file does not reconnect if connection stops yet.

import { Client } from "pg";
import { dispatch, RealtimeEvent } from "@/lib/events/hub";

// prisma does not allow LISTEN
async function startListener() {

    const client = new Client({ connectionString: process.env.DATABASE_URL });

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

    await client.connect();
    await client.query("LISTEN ft_events");
    console.log("Listener connected");
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