// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/events/route";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/events/publish";

// Needs a real Postgres (LISTEN/NOTIFY): skipped locally without DATABASE_URL,
// but CI must always run it, so a missing database fails there.
const hasDatabase = Boolean(process.env.DATABASE_URL);
if (!hasDatabase && process.env.CI) {
    throw new Error("DATABASE_URL is required in CI for the realtime integration test");
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string) {
    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes(expected)) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        received += decoder.decode(value);
    }
    return received;
}

describe.skipIf(!hasDatabase)("Integration: realtime events", () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("delivers a published event to an open SSE stream", async () => {
        const response = await GET(new Request("http://localhost/api/events"));
        expect(response.headers.get("Content-Type")).toBe("text/event-stream");

        const body = response.body;
        if (!body) {
            throw new Error("the SSE response has no body");
        }
        const reader = body.getReader();
        await readUntil(reader, ": connected");
        await prisma.$transaction(async (tx) => {
            await publish(tx, "test", { id: "42" });
        });

        const received = await readUntil(reader, '{"id":"42"}');
        expect(received).toContain('event: test\ndata: {"id":"42"}');
        await reader.cancel();
    });
    it("does not deliver an event whose transaction rolls back", async () => {
        const response = await GET(new Request("http://localhost/api/events"));
        const body = response.body;
        if (!body) {
            throw new Error("the SSE response has no body");
        }
        const reader = body.getReader();
        await readUntil(reader, ": connected");

        await expect(
            prisma.$transaction(async (tx) => {
                await publish(tx, "test", { id: "rolled-back" });
                throw new Error("forced rollback"); 
            }),
        ).rejects.toThrow("forced rollback");

        // NOTIFYs arrive in commit order: if the rolled-back one had been sent,
        // it would show up before this one.
        await prisma.$transaction(async (tx) => {
            await publish(tx, "test", {id: "after" });
        });
        const received = await readUntil(reader, '{"id":"after"}');
        expect(received).not.toContain("rolled-back");
        
        await reader.cancel();
    });
});