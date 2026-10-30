import { describe, expect, it } from "vitest";
import { ATHLETE_1_ID, CLUB_ID, GROUP_BEGINNERS_ID } from "../../../prisma/seed/ids";
import { generateSessionHistory, type GeneratedLog } from "../../../prisma/seed/session-logs";

const DAY_MS = 24 * 60 * 60 * 1000;
// Believable running paces: 2:30 to 10:00 min/km
const MIN_PACE_S_PER_KM = 150;
const MAX_PACE_S_PER_KM = 600;
const start = new Date("2026-09-07T00:00:00.000Z");
const end = new Date(start.getTime() + 42 * DAY_MS);

// Same Athlete and dates every time; only the random source changes
function generateWith(random: () => number) {
  return generateSessionHistory({
    athleteId: ATHLETE_1_ID,
    orgId: CLUB_ID,
    groupId: GROUP_BEGINNERS_ID,
    start,
    random,
  });
}

const history = generateWith(() => 0.5);
// Edges of random's range [0, 1): range bugs show up here, not in the middle
const low = generateWith(() => 0);
const high = generateWith(() => 0.99);

function averageRpe(logs: GeneratedLog[]): number {
  let total = 0;
  for (const log of logs) {
    total += log.rpe;
  }
  return total / logs.length;
}

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
    const allLogs = [...low.logs, ...history.logs, ...high.logs];
    for (const log of allLogs) {
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

  it("gives every log a positive distance and duration at a believable pace", () => {
    for (const log of history.logs) {
      expect(Number.isInteger(log.distanceM)).toBe(true);
      expect(log.distanceM).toBeGreaterThan(0);
      expect(Number.isInteger(log.durationS)).toBe(true);
      expect(log.durationS).toBeGreaterThan(0);

      const paceSPerKm = log.durationS / (log.distanceM / 1000);
      expect(paceSPerKm).toBeGreaterThanOrEqual(MIN_PACE_S_PER_KM);
      expect(paceSPerKm).toBeLessThanOrEqual(MAX_PACE_S_PER_KM);
    }
  });

  it("gives a lower average RPE when random always returns low values", () => {
    expect(averageRpe(low.logs)).toBeLessThan(averageRpe(high.logs));
  });
});
