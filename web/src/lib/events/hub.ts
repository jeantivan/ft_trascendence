// Works as the hub between Postgres listener and the SSE streams (ADR 0001)
// In-memory only: it does not talk to Postgres or HTTP, and it does not
// filter recipients yet (every open stream gets every event)


import {EventEmitter} from "node:events";

// payload carries only ids (ADR 0001): clients fetch the content from an endpoint
// that checks permissions. Never put RPE or Feedback here.
export type RealtimeEvent = {channel: string, payload: Record<string, string | number> };
const EVENT_NAME = "event";

// In development Next.js reloads modules on every change. Keeping the emitter
// on globalThis means there is only one hub, so old streams still get events.
const globalForHub = globalThis as unknown as { eventHub?: EventEmitter };
const emitter = globalForHub.eventHub ?? new EventEmitter();
globalForHub.eventHub = emitter;

// Limit removed so extra tabs wont be a false positive for a leak
emitter.setMaxListeners(0);

// Called by Postgres listener.
export function dispatch(event: RealtimeEvent) {
    emitter.emit(EVENT_NAME, event);
}

// Returns an unsubscribe function: call it when the stream closes, or the listener leaks.
export function subscribe(listener: (event: RealtimeEvent) => void) {
    emitter.on(EVENT_NAME, listener);
    return () => {
        emitter.off(EVENT_NAME, listener);
    };
}