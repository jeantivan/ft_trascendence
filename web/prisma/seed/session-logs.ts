// Generates a simulated training history (TrainingSessions + SessionLogs) for
// the demo seed, so analytics can be built before Athletes log real sessions.
// Pure: it never touches the database; seed.ts saves what it returns.
//
// Each week: a few group sessions (Template Sessions) on different days, and
// for each Athlete a few Free Sessions and direct Customized Sessions (limits
// in the *_PER_WEEK constants).
// Sometimes the Manager adapts a group session for one Athlete: that copy
// replaces it for them (#68), so their log goes on the copy, never on both.
// Half of the sessions are easy runs (rodaje). The RPE, distance and time of
// each log depend on the session type (see RPE_RANGES and EFFORT_RANGES).
// A few logs are abandoned midway: not completed, with a reason.
// Every amount and day comes from random: the same random sequence (seed)
// gives the same history. Changing the order of the random() calls changes it.
import { SessionOrigin, SessionType } from "../../src/generated/prisma/enums";

export interface SessionHistoryParams {
  athleteIds: string[];
  orgId: string;
  groupId: string;
  // First day of the 6 weeks
  start: Date;
  // Returns a number in [0, 1), like Math.random. Tests pass a fixed one.
  random: () => number;
  // Ids are built from this number: give each group its own range, at least
  // maxSessionCount long (e.g. 101 and 201), or their sessions get the same ids.
  firstSessionNumber: number;
}

export interface GeneratedSession {
  id: string;
  // Owner of an individual session (free or customized); null in group sessions
  athleteId: string | null;
  // Every session belongs to a club, individual ones too
  orgId: string;
  // Group of a group session; null in individual sessions
  groupId: string | null;
  // Group session that this customized copy adapts; null in any other session
  customizesSessionId: string | null;
  origin: SessionOrigin;
  sessionType: SessionType;
  scheduledAt: Date;
}

export interface GeneratedLog {
  // id of one of the generated sessions
  sessionId: string;
  athleteId: string;
  performedAt: Date;
  // 1-10, like SessionLog.rpe
  rpe: number;
  // Metres, rounded to 100 m
  distanceM: number;
  // Seconds
  durationS: number;
  completed: boolean;
  // Why the Athlete did not finish (one of INCOMPLETION_REASONS); null when
  // completed. seed.ts saves it in SessionLog.extra as incompletion_reason.
  incompletionReason: string | null;
}

export interface SessionHistory {
  sessions: GeneratedSession[];
  logs: GeneratedLog[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 6;
// Limits of the weekly amounts. maxSessionCount adds up the maximums, so
// change them here, never as a number inside the code.
const MIN_GROUP_SESSIONS_PER_WEEK = 2;
const MAX_GROUP_SESSIONS_PER_WEEK = 4;
// Per Athlete
const MAX_FREE_SESSIONS_PER_WEEK = 2;
const MAX_DIRECT_CUSTOMIZED_PER_WEEK = 2;
// How often the Manager adapts a group session for one Athlete
const CUSTOMIZE_CHANCE = 0.1;
// How often the Manager prescribes a new individual session (each of the
// MAX_DIRECT_CUSTOMIZED_PER_WEEK draws a week)
const PRESCRIBE_CHANCE = 0.1;
// Usual RPE of each session type. Orientation from CONTEXT.md: easy runs 4-5,
// hard sessions 7-9; one point of margin for tired or good days.
const RPE_RANGES: Record<SessionType, { min: number; max: number }> = {
  rodaje: { min: 3, max: 6 },
  tirada_larga: { min: 5, max: 8 },
  intervalos: { min: 6, max: 9 },
  cuestas: { min: 6, max: 9 },
  fartlek: { min: 6, max: 9 },
};
// Usual distance (metres) and average pace (seconds per km; 300 = 5:00 min/km)
// of each session type. Intervals include warm-up and recoveries.
const EFFORT_RANGES: Record<SessionType, { distance: [number, number]; pace: [number, number] }> = {
  rodaje: { distance: [6000, 12000], pace: [300, 390] },
  tirada_larga: { distance: [15000, 25000], pace: [315, 405] },
  intervalos: { distance: [6000, 10000], pace: [270, 330] },
  cuestas: { distance: [6000, 10000], pace: [300, 390] },
  fartlek: { distance: [7000, 12000], pace: [285, 345] },
};
// How often a log is an odd day, with any RPE from 1 to 10
const ODD_DAY_CHANCE = 0.02;
// How often an Athlete abandons a session midway (#23: option a, RPE kept)
const INCOMPLETE_CHANCE = 0.05;
// Reasons that fit an abandoned session, from the closed list of
// docs/gdpr/export-spec.md 3.3
const INCOMPLETION_REASONS = ["time_constraints", "equipment_issue", "other"];

// Same format as seed/ids.ts, because sessions.id is a Postgres uuid column.
// The Athletes of a group share its sessions, so ids only collide between
// groups, if their firstSessionNumber ranges overlap. Exported so seed.ts can
// find the ids a group may have used before.
export function sessionId(number: number): string {
  return "00000000-0000-4000-8000-" + String(number).padStart(12, "0");
}

// Midnight of the given day (0 = Monday) of the given week
function sessionDate(start: Date, week: number, day: number): Date {
  return new Date(start.getTime() + (week * 7 + day) * DAY_MS);
}

// Days of one week (0 = Monday) with a group session: MIN_ to
// MAX_GROUP_SESSIONS_PER_WEEK different days, in order
function groupDays(random: () => number): number[] {
  const count = randomInt(MIN_GROUP_SESSIONS_PER_WEEK, MAX_GROUP_SESSIONS_PER_WEEK, random);
  const available = [0, 1, 2, 3, 4, 5, 6];
  const days: number[] = [];
  for (let i = 0; i < count; i++) {
    // Take the day out of the list, so it cannot come out again
    const position = randomInt(0, available.length - 1, random);
    days.push(available.splice(position, 1)[0]);
  }
  // Like qsort's compare in C: negative means a goes first
  return days.sort((a, b) => a - b);
}

// Like real runners: half of the sessions are easy runs (rodaje), the other
// half is split evenly among the hard types
function pickSessionType(random: () => number): SessionType {
  if (random() < 0.5) {
    return "rodaje";
  }
  const hardTypes = Object.values(SessionType).filter((type) => type !== "rodaje");
  return hardTypes[randomInt(0, hardTypes.length - 1, random)];
}

// An integer from min to max, both included
function randomInt(min: number, max: number, random: () => number): number {
  // random() is in [0, 1); + 1 because both ends count: 3 to 6 is 4 values
  return min + Math.floor(random() * (max - min + 1));
}

// Distance and time of one log. The time comes from distance x pace, so the
// two always match and the pace is believable.
function pickEffort(sessionType: SessionType, random: () => number): { distanceM: number; durationS: number } {
  const range = EFFORT_RANGES[sessionType];
  // Rounded to 100 m, like people write it down
  const distanceM = 100 * randomInt(range.distance[0] / 100, range.distance[1] / 100, random);
  const paceSPerKm = randomInt(range.pace[0], range.pace[1], random);
  return { distanceM, durationS: Math.round((distanceM / 1000) * paceSPerKm) };
}

// RPE 1-10 of one log. Usually inside the range of its session type; on a
// rare odd day (very tired, or a great day) it can be anything, 1 and 10 too.
function pickRpe(sessionType: SessionType, random: () => number): number {
  if (random() < ODD_DAY_CHANCE) {
    return randomInt(1, 10, random);
  }
  const range = RPE_RANGES[sessionType];
  return randomInt(range.min, range.max, random);
}

// What one Athlete did in one session: RPE, distance and time depend on its
// type; an abandoned log keeps its RPE and gets a shorter distance and time
function makeLog(
  sessionId: string,
  athleteId: string,
  date: Date,
  sessionType: SessionType,
  random: () => number,
): GeneratedLog {
  // Order of the random() calls: RPE, effort, then whether they abandon
  const rpe = pickRpe(sessionType, random);
  const effort = pickEffort(sessionType, random);

  // Sometimes the Athlete abandons the session midway
  let completed = true;
  let incompletionReason: string | null = null;
  if (random() < INCOMPLETE_CHANCE) {
    completed = false;
    incompletionReason = INCOMPLETION_REASONS[randomInt(0, INCOMPLETION_REASONS.length - 1, random)];
    // They ran 20 to 80 % of it, rounded to 100 m like a completed log
    const percent = randomInt(20, 80, random);
    const plannedDistanceM = effort.distanceM;
    effort.distanceM = 100 * Math.round((plannedDistanceM * percent) / 100 / 100);
    // Time cut in the same proportion: same pace, they just stopped earlier
    effort.durationS = Math.round((effort.durationS * effort.distanceM) / plannedDistanceM);
  }

  return {
    sessionId,
    athleteId,
    performedAt: date,
    rpe,
    // distanceM and durationS
    ...effort,
    completed,
    incompletionReason,
  };
}

export function generateSessionHistory(params: SessionHistoryParams): SessionHistory {
  const sessions: GeneratedSession[] = [];
  const logs: GeneratedLog[] = [];
  let nextSessionNumber = params.firstSessionNumber;

  // A session of one Athlete (no group) and its only log, which is theirs
  function addIndividualSession(
    athleteId: string,
    date: Date,
    origin: SessionOrigin,
    customizesSessionId: string | null,
  ): void {
    const id = sessionId(nextSessionNumber);
    const sessionType = pickSessionType(params.random);
    nextSessionNumber++;
    sessions.push({
      id,
      athleteId,
      orgId: params.orgId,
      groupId: null,
      customizesSessionId,
      origin,
      sessionType,
      scheduledAt: date,
    });
    logs.push(makeLog(id, athleteId, date, sessionType, params.random));
  }

  for (let week = 0; week < WEEKS; week++) {
    for (const day of groupDays(params.random)) {
      const id = sessionId(nextSessionNumber);
      const date = sessionDate(params.start, week, day);
      const sessionType = pickSessionType(params.random);
      nextSessionNumber++;

      sessions.push({
        id,
        athleteId: null,
        orgId: params.orgId,
        groupId: params.groupId,
        customizesSessionId: null,
        origin: "template",
        sessionType,
        scheduledAt: date,
      });
      // One log per Athlete: each one rates the same session differently
      for (const athleteId of params.athleteIds) {
        // Sometimes the Manager adapts this session for one Athlete. The copy
        // replaces it for them (#68), so their log goes on the copy instead.
        if (params.random() < CUSTOMIZE_CHANCE) {
          addIndividualSession(athleteId, date, "customized", id);
        } else {
          logs.push(makeLog(id, athleteId, date, sessionType, params.random));
        }
      }
    }

    // Free Sessions: each Athlete adds 0 to MAX_FREE_SESSIONS_PER_WEEK of their
    // own, any day
    for (const athleteId of params.athleteIds) {
      const count = randomInt(0, MAX_FREE_SESSIONS_PER_WEEK, params.random);
      for (let i = 0; i < count; i++) {
        const day = randomInt(0, 6, params.random);
        addIndividualSession(athleteId, sessionDate(params.start, week, day), "free", null);
      }
    }

    // Direct Customized Sessions: the Manager prescribes new ones, not adapted
    // from a group session (#68). One unlikely draw each keeps the maximum rare.
    for (const athleteId of params.athleteIds) {
      for (let i = 0; i < MAX_DIRECT_CUSTOMIZED_PER_WEEK; i++) {
        if (params.random() < PRESCRIBE_CHANCE) {
          const day = randomInt(0, 6, params.random);
          addIndividualSession(athleteId, sessionDate(params.start, week, day), "customized", null);
        }
      }
    }
  }

  return { sessions, logs };
}

// Most sessions (and so session ids) generateSessionHistory can create for a
// group: give the next group a firstSessionNumber at least this much higher.
export function maxSessionCount(athleteCount: number): number {
  // Per Athlete: one adapted copy per group session at most, plus their Free
  // and direct Customized Sessions
  const perAthlete = MAX_GROUP_SESSIONS_PER_WEEK + MAX_FREE_SESSIONS_PER_WEEK + MAX_DIRECT_CUSTOMIZED_PER_WEEK;
  return WEEKS * (MAX_GROUP_SESSIONS_PER_WEEK + athleteCount * perAthlete);
}

// Monday 00:00 UTC of the 6 full weeks that end just before today's week
export function historyStart(today: Date): Date {
  // getUTCDay() starts on Sunday (0); this makes Monday 0 and Sunday 6
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  // A negative day is fine: Date.UTC moves back the months, like mktime in C
  const day = today.getUTCDate() - daysSinceMonday - WEEKS * 7;
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
}
