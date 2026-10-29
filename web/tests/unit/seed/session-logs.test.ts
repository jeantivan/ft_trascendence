import { describe, expect, it } from "vitest";
import { ATHLETE_1_ID, CLUB_ID, GROUP_BEGINNERS_ID } from "../../../prisma/seed/ids";
import { generateSessionHistory } from "../../../prisma/seed/session-logs";

const DAY_MS = 24 * 60 * 60 * 1000;
const start = new Date("2026-09-07T00:00:00.000Z");
const end = new Date(start.getTime() + 42 * DAY_MS);

const history = generateSessionHistory({
  athleteId: ATHLETE_1_ID,
  orgId: CLUB_ID,
  groupId: GROUP_BEGINNERS_ID,
  start,
  random: () => 0.5,
});

describe("generateSessionHistory", () => {
  it("places every session and log inside the 6 weeks after start", () => {
    expect(history.sessions.length).toBeGreaterThan(0);
    expect(history.logs.length).toBeGreaterThan(0);

    const dates = [
      ...history.sessions.map((session) => session.scheduledAt),
      ...history.logs.map((log) => log.performedAt),
    ];
    for (const date of dates) {
      expect(date.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(date.getTime()).toBeLessThan(end.getTime());
    }
  });

  it("gives every log an integer RPE between 1 and 10", () => {
    for (const log of history.logs) {
      expect(Number.isInteger(log.rpe)).toBe(true);
      expect(log.rpe).toBeGreaterThanOrEqual(1);
      expect(log.rpe).toBeLessThanOrEqual(10);
    }
  });

  it("links every log to a generated session, at most one log per session", () => {
    const sessionIds = new Set(history.sessions.map((session) => session.id));
    for (const log of history.logs) {
      expect(sessionIds.has(log.sessionId)).toBe(true);
    }

    // Same rule as @@unique([sessionId, athleteId]) in the schema
    const loggedSessionIds = new Set(history.logs.map((log) => log.sessionId));
    expect(loggedSessionIds.size).toBe(history.logs.length);
  });
});
