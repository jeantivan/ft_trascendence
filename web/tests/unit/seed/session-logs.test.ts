import { describe, expect, it } from "vitest";
import {
  ATHLETE_1_ID,
  ATHLETE_2_ID,
  CLUB_ID,
  GROUP_ADVANCED_ID,
  GROUP_BEGINNERS_ID,
} from "../../../prisma/seed/ids";
import {
  generateSessionHistory,
  historyStart,
  type GeneratedLog,
  type SessionHistory,
} from "../../../prisma/seed/session-logs";
import { seededRandom } from "../../../prisma/seed/random";
import { SessionType } from "../../../src/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;
// Believable running paces: 2:30 to 10:00 min/km
const MIN_PACE_S_PER_KM = 150;
const MAX_PACE_S_PER_KM = 600;
const start = new Date("2026-09-07T00:00:00.000Z");
const end = new Date(start.getTime() + 42 * DAY_MS);

// Same Athlete and dates every time; only the random source changes
function generateWith(random: () => number) {
  return generateSessionHistory({
    athleteIds: [ATHLETE_1_ID],
    orgId: CLUB_ID,
    groupId: GROUP_BEGINNERS_ID,
    firstSessionNumber: 101,
    start,
    random,
  });
}

const history = generateWith(() => 0.5);
// Edges of random's range [0, 1): range bugs show up here, not in the middle
const low = generateWith(() => 0);
const high = generateWith(() => 0.99);

// A group with two Athletes; add random to call generateSessionHistory
const bothAthletes = [ATHLETE_1_ID, ATHLETE_2_ID];
const groupOfTwo = {
  athleteIds: bothAthletes,
  orgId: CLUB_ID,
  groupId: GROUP_BEGINNERS_ID,
  start,
  firstSessionNumber: 101,
};

// Many random sources for the rules that must hold for any history: the edges
// plus 100 seeds. A new list on every call, because each seededRandom moves on
// when used and a test must not get one that another test already used.
function randomSources(): (() => number)[] {
  const sources = [() => 0, () => 0.5, () => 0.99];
  for (let seed = 1; seed <= 100; seed++) {
    sources.push(seededRandom(seed));
  }
  return sources;
}

function averageRpe(logs: GeneratedLog[]): number {
  let total = 0;
  for (const log of logs) {
    total += log.rpe;
  }
  return total / logs.length;
}

function sequence(values: number[]): () => number {
  let index = 0;

  return () => {
    const value = values[index];

    index = (index + 1) % values.length;
    return value;
  };
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
    for (const random of randomSources()) {
      for (const log of generateWith(random).logs) {
        expect(Number.isInteger(log.rpe)).toBe(true);
        expect(log.rpe).toBeGreaterThanOrEqual(1);
        expect(log.rpe).toBeLessThanOrEqual(10);
      }
    }
  });

  it("links every log to a generated session, at most one log per session and Athlete", () => {
    for (const random of randomSources()) {
      const generated = generateSessionHistory({ ...groupOfTwo, random });
      const sessionIds = new Set(generated.sessions.map((session) => session.id));
      for (const log of generated.logs) {
        expect(sessionIds.has(log.sessionId)).toBe(true);
      }

      // Same rule as @@unique([sessionId, athleteId]) in the schema
      const pairs = new Set(generated.logs.map((log) => log.sessionId + "/" + log.athleteId));
      expect(pairs.size).toBe(generated.logs.length);
    }
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

  it("schedules at least one session in each of the 6 weeks", () => {
    for (const generated of [low, history, high]) {
      for (let week = 0; week < 6; week++) {
        const weekStart = start.getTime() + week * 7 * DAY_MS;
        const weekEnd = weekStart + 7 * DAY_MS;

        let sessionsThisWeek = 0;
        for (const session of generated.sessions) {
          const time = session.scheduledAt.getTime();
          if (time >= weekStart && time < weekEnd) {
            sessionsThisWeek++;
          }
        }
        expect(sessionsThisWeek).toBeGreaterThan(0);
      }
    }
  });

  it("schedules 2 to 4 group sessions a week, on different days", () => {
    for (const random of randomSources()) {
      const generated = generateWith(random);
      for (let week = 0; week < 6; week++) {
        const weekStart = start.getTime() + week * 7 * DAY_MS;

        // Day of the week (0 = Monday) of each group session of this week
        const days: number[] = [];
        for (const session of generated.sessions) {
          const sinceWeekStart = session.scheduledAt.getTime() - weekStart;
          if (session.origin === "template" && sinceWeekStart >= 0 && sinceWeekStart < 7 * DAY_MS) {
            days.push(sinceWeekStart / DAY_MS);
          }
        }
        expect(days.length).toBeGreaterThanOrEqual(2);
        expect(days.length).toBeLessThanOrEqual(4);
        // No two group sessions on the same day
        expect(new Set(days).size).toBe(days.length);
      }
    }
  });

  it("schedules 2 group sessions a week with low random and 4 with high random", () => {
    const groupSessions = (generated: SessionHistory) =>
      generated.sessions.filter((s) => s.origin === "template");
    expect(groupSessions(low)).toHaveLength(2 * 6);
    expect(groupSessions(high)).toHaveLength(4 * 6);
  });

  it("gives every session a valid session type", () => {
    for (const random of randomSources()) {
      for (const session of generateWith(random).sessions) {
        expect(Object.values(SessionType)).toContain(session.sessionType);
      }
    }
  });

  it("makes about half of the sessions easy runs and splits the rest among the other types", () => {
    // How many sessions of each type, over the histories of 100 seeds
    const counts: Record<string, number> = {};
    let total = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (const session of generateWith(seededRandom(seed)).sessions) {
        counts[session.sessionType] = (counts[session.sessionType] ?? 0) + 1;
        total++;
      }
    }

    // Over thousands of sessions the shares get close to 50 % and 12.5 %
    expect(counts.rodaje / total).toBeGreaterThan(0.45);
    expect(counts.rodaje / total).toBeLessThan(0.55);
    for (const type of Object.values(SessionType)) {
      if (type !== "rodaje") {
        expect(counts[type] / total).toBeGreaterThan(0.09);
        expect(counts[type] / total).toBeLessThan(0.16);
      }
    }
  });

  it("uses rodaje with low random and the last hard type with high random", () => {
    for (const session of low.sessions) {
      expect(session.sessionType).toBe("rodaje");
    }
    for (const session of high.sessions) {
      expect(session.sessionType).toBe("fartlek");
    }
  });

  it("keeps almost every RPE inside the usual range of its session type", () => {
    // Orientation from CONTEXT.md: easy runs 4-5, hard sessions 7-9, with margin
    const usual: Record<SessionType, { min: number; max: number }> = {
      rodaje: { min: 3, max: 6 },
      tirada_larga: { min: 5, max: 8 },
      intervalos: { min: 6, max: 9 },
      cuestas: { min: 6, max: 9 },
      fartlek: { min: 6, max: 9 },
    };
    let inside = 0;
    let total = 0;
    // "type/rpe" pairs that came out
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const generated = generateWith(seededRandom(seed));
      for (const log of generated.logs) {
        const session = generated.sessions.find((s) => s.id === log.sessionId);
        const range = usual[session!.sessionType];
        seen.add(session!.sessionType + "/" + log.rpe);
        if (log.rpe >= range.min && log.rpe <= range.max) {
          inside++;
        }
        total++;
      }
    }
    // About 2 % are odd days, with any RPE
    expect(inside / total).toBeGreaterThan(0.95);

    // And every value of each range comes out, its ends too (off-by-one bugs)
    for (const type of Object.values(SessionType)) {
      for (let rpe = usual[type].min; rpe <= usual[type].max; rpe++) {
        expect(seen.has(type + "/" + rpe)).toBe(true);
      }
    }
  });

  it("gives each log a distance and pace inside the range of its session type", () => {
    // Distance in metres; pace in seconds per km (300 = 5:00 min/km)
    const usual: Record<SessionType, { distance: [number, number]; pace: [number, number] }> = {
      rodaje: { distance: [6000, 12000], pace: [300, 390] },
      tirada_larga: { distance: [15000, 25000], pace: [315, 405] },
      intervalos: { distance: [6000, 10000], pace: [270, 330] },
      cuestas: { distance: [6000, 10000], pace: [300, 390] },
      fartlek: { distance: [7000, 12000], pace: [285, 345] },
    };
    // "type/distance" pairs that came out
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const generated = generateWith(seededRandom(seed));
      for (const log of generated.logs) {
        const type = generated.sessions.find((s) => s.id === log.sessionId)!.sessionType;
        const [minDistance, maxDistance] = usual[type].distance;
        const [minPace, maxPace] = usual[type].pace;

        // Rounded to 100 m, like people write it down
        expect(log.distanceM % 100).toBe(0);
        expect(log.distanceM).toBeGreaterThanOrEqual(minDistance);
        expect(log.distanceM).toBeLessThanOrEqual(maxDistance);
        // durationS is rounded to the second, so the pace can be off by a fraction
        const pace = log.durationS / (log.distanceM / 1000);
        expect(pace).toBeGreaterThanOrEqual(minPace - 1);
        expect(pace).toBeLessThanOrEqual(maxPace + 1);
        seen.add(type + "/" + log.distanceM);
      }
    }

    // Both ends of every distance range come out (off-by-one bugs)
    for (const type of Object.values(SessionType)) {
      expect(seen.has(type + "/" + usual[type].distance[0])).toBe(true);
      expect(seen.has(type + "/" + usual[type].distance[1])).toBe(true);
    }
  });

  it("gives an RPE of 1 or 10 only on rare odd days", () => {
    let extremes = 0;
    let total = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (const log of generateWith(seededRandom(seed)).logs) {
        if (log.rpe === 1 || log.rpe === 10) {
          extremes++;
        }
        total++;
      }
    }
    // Possible, but about 0.4 % of the logs
    expect(extremes).toBeGreaterThan(0);
    expect(extremes / total).toBeLessThan(0.02);
  });

  it("gives a lower average RPE when random always returns low values", () => {
    expect(averageRpe(low.logs)).toBeLessThan(averageRpe(high.logs));
  });

  it("returns the same history for the same random sequence", () => {
    const first = generateWith(sequence([0.1, 0.7, 0.3, 0.95]));
    const second = generateWith(sequence([0.1, 0.7, 0.3, 0.95]));

    expect(first).toEqual(second);
  });

  it("gives every Athlete of the group exactly one log per session", () => {
    const athleteIds = [ATHLETE_1_ID, ATHLETE_2_ID];
    const group = generateSessionHistory({
      athleteIds,
      orgId: CLUB_ID,
      groupId: GROUP_BEGINNERS_ID,
      start,
      // 0.5 adapts no session (0.5 < CUSTOMIZE_CHANCE is false), so every log
      // stays on its group session. Adapted ones are checked in the #68 test.
      random: () => 0.5,
      firstSessionNumber: 101,
    });

    // Free Sessions only have their owner's log, so count group sessions only
    const templates = group.sessions.filter((s) => s.origin === "template");
    const templateIds = templates.map((s) => s.id);
    const templateLogs = group.logs.filter((log) => templateIds.includes(log.sessionId));
    expect(templates.length).toBeGreaterThan(0);
    expect(templateLogs.length).toBe(templates.length * athleteIds.length);

    // Same rule as @@unique([sessionId, athleteId]) in the schema
    const pairs = new Set<string>();
    for (const log of group.logs) {
      expect(athleteIds).toContain(log.athleteId);
      pairs.add(log.sessionId + "/" + log.athleteId);
    }
    expect(pairs.size).toBe(group.logs.length);
  });

  it("creates Template Sessions of the given club and group", () => {
    const templates = history.sessions.filter((s) => s.origin === "template");
    // An empty list would pass the loop without checking anything
    expect(templates.length).toBeGreaterThan(0);
    for (const session of templates) {
      expect(session.orgId).toBe(CLUB_ID);
      expect(session.groupId).toBe(GROUP_BEGINNERS_ID);
      // Group session: no owner (schema rule)
      expect(session.athleteId).toBeNull();
      expect(session.origin).toBe("template");
      expect(Object.values(SessionType)).toContain(session.sessionType);
    }
  });

  it("marks every log as completed", () => {
    for (const log of history.logs) {
      expect(log.completed).toBe(true);
    }
  });

  it("gives each Athlete 0 to 2 Free Sessions a week, each with only their own log", () => {
    const athleteIds = [ATHLETE_1_ID, ATHLETE_2_ID];
    const params = {
      athleteIds,
      orgId: CLUB_ID,
      groupId: GROUP_BEGINNERS_ID,
      start,
      firstSessionNumber: 101,
    };

    // Low random: none. High random: 2 a week for each Athlete
    const none = generateSessionHistory({ ...params, random: () => 0 });
    expect(none.sessions.filter((s) => s.origin === "free")).toHaveLength(0);
    const twoAWeek = generateSessionHistory({ ...params, random: () => 0.99 });
    const free = twoAWeek.sessions.filter((s) => s.origin === "free");
    expect(free).toHaveLength(2 * 6 * athleteIds.length);

    for (const session of free) {
      expect(session.orgId).toBe(CLUB_ID);
      expect(session.groupId).toBeNull();
      expect(athleteIds).toContain(session.athleteId);
      expect(session.scheduledAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(session.scheduledAt.getTime()).toBeLessThan(end.getTime());

      const logs = twoAWeek.logs.filter((log) => log.sessionId === session.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].athleteId).toBe(session.athleteId);
    }
  });

  it("moves an Athlete's log to the Customized Session that adapts a group session", () => {
    // random 0: the Manager adapts every group session for every Athlete
    const allAdapted = generateSessionHistory({ ...groupOfTwo, random: () => 0 });
    const templates = allAdapted.sessions.filter((s) => s.origin === "template");
    expect(templates.length).toBeGreaterThan(0);

    for (const template of templates) {
      // Nobody logs the original: each Athlete logs their own copy
      expect(allAdapted.logs.filter((log) => log.sessionId === template.id)).toHaveLength(0);
      for (const athleteId of bothAthletes) {
        const copies = allAdapted.sessions.filter(
          (s) => s.customizesSessionId === template.id && s.athleteId === athleteId,
        );
        expect(copies).toHaveLength(1);
        expect(copies[0].origin).toBe("customized");
        expect(copies[0].orgId).toBe(CLUB_ID);
        expect(copies[0].groupId).toBeNull();
        expect(copies[0].scheduledAt).toEqual(template.scheduledAt);

        const copyLogs = allAdapted.logs.filter((log) => log.sessionId === copies[0].id);
        expect(copyLogs).toHaveLength(1);
        expect(copyLogs[0].athleteId).toBe(athleteId);
      }
    }
  });

  it("gives each Athlete one log per group session, on it or on their adaptation (#68)", () => {
    for (const random of randomSources()) {
      const generated = generateSessionHistory({ ...groupOfTwo, random });
      for (const template of generated.sessions.filter((s) => s.origin === "template")) {
        // The group session plus the copies that adapt it
        const ids = [template.id];
        for (const session of generated.sessions) {
          if (session.customizesSessionId === template.id) {
            ids.push(session.id);
          }
        }
        for (const athleteId of bothAthletes) {
          const athleteLogs = generated.logs.filter(
            (log) => log.athleteId === athleteId && ids.includes(log.sessionId),
          );
          // Never both: #68 replaces the group session with the adaptation
          expect(athleteLogs).toHaveLength(1);
        }
      }
    }
  });

  it("gives each Athlete 0 to 2 direct Customized Sessions a week, each with only their own log", () => {
    // Direct: prescribed by the Manager without adapting a group session
    const direct = (generated: SessionHistory) =>
      generated.sessions.filter((s) => s.origin === "customized" && s.customizesSessionId === null);

    // Low random: 2 a week for each Athlete. High random: none
    const twoAWeek = generateSessionHistory({ ...groupOfTwo, random: () => 0 });
    expect(direct(twoAWeek)).toHaveLength(2 * 6 * bothAthletes.length);
    expect(direct(generateSessionHistory({ ...groupOfTwo, random: () => 0.99 }))).toHaveLength(0);

    for (const session of direct(twoAWeek)) {
      expect(session.orgId).toBe(CLUB_ID);
      expect(session.groupId).toBeNull();
      expect(bothAthletes).toContain(session.athleteId);
      expect(session.scheduledAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(session.scheduledAt.getTime()).toBeLessThan(end.getTime());

      const logs = twoAWeek.logs.filter((log) => log.sessionId === session.id);
      expect(logs).toHaveLength(1);
      expect(logs[0].athleteId).toBe(session.athleteId);
    }
  });

  it("gives two groups different session ids when their numbers do not overlap", () => {
    const advanced = generateSessionHistory({
      athleteIds: [ATHLETE_2_ID],
      orgId: CLUB_ID,
      groupId: GROUP_ADVANCED_ID,
      firstSessionNumber: 201,
      start,
      random: () => 0.5,
    });

    const beginnersIds = new Set(history.sessions.map((session) => session.id));
    for (const session of advanced.sessions) {
      expect(beginnersIds.has(session.id)).toBe(false);
    }
  });
});

describe("historyStart", () => {
  // The 6 weeks before the week of today: Monday 14 Sep to Sunday 25 Oct 2026
  const expected = new Date("2026-09-14T00:00:00.000Z");

  it("returns the Monday 6 weeks before the current week", () => {
    expect(historyStart(new Date("2026-10-29T15:30:00.000Z"))).toEqual(expected);
  });

  it("treats a Monday as the first day of the current week", () => {
    expect(historyStart(new Date("2026-10-26T00:00:00.000Z"))).toEqual(expected);
  });

  it("treats a Sunday as the last day of the current week", () => {
    expect(historyStart(new Date("2026-11-01T23:59:00.000Z"))).toEqual(expected);
  });
});
