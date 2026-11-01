// Generates a simulated training history (TrainingSessions + SessionLogs) for
// the demo seed, so analytics can be built before Athletes log real sessions.
// Pure: it never touches the database; seed.ts saves what it returns.
//
// Each week: 2 to 4 group sessions (Template Sessions) on different days, and
// for each Athlete 0 to 2 Free Sessions and 0 to 2 direct Customized Sessions.
// Sometimes the Manager adapts a group session for one Athlete: that copy
// replaces it for them (#68), so their log goes on the copy, never on both.
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
  // Ids are built from this number: give each group its own range
  // (e.g. 101 and 201) or their sessions get the same ids.
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
  distanceM: number;
  durationS: number;
  completed: boolean;
}

export interface SessionHistory {
  sessions: GeneratedSession[];
  logs: GeneratedLog[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 6;
// How often the Manager adapts a group session for one Athlete
const CUSTOMIZE_CHANCE = 0.1;
// How often the Manager prescribes a new individual session (each of 2 draws a week)
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
// How often a log is an odd day, with any RPE from 1 to 10
const ODD_DAY_CHANCE = 0.02;

// Same format as seed/ids.ts, because sessions.id is a Postgres uuid column.
// The Athletes of a group share its sessions, so ids only collide between
// groups, if their firstSessionNumber ranges overlap.
function sessionId(number: number): string {
  return "00000000-0000-4000-8000-" + String(number).padStart(12, "0");
}

// Midnight of the given day (0 = Monday) of the given week
function sessionDate(start: Date, week: number, day: number): Date {
  return new Date(start.getTime() + (week * 7 + day) * DAY_MS);
}

// Days of one week (0 = Monday) with a group session: 2 to 4 different days, in order
function groupDays(random: () => number): number[] {
  const count = 2 + Math.floor(random() * 3);
  const available = [0, 1, 2, 3, 4, 5, 6];
  const days: number[] = [];
  for (let i = 0; i < count; i++) {
    // Take the day out of the list, so it cannot come out again
    const position = Math.floor(random() * available.length);
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
  return hardTypes[Math.floor(random() * hardTypes.length)];
}

// RPE 1-10 of one log. Usually inside the range of its session type; on a
// rare odd day (very tired, or a great day) it can be anything, 1 and 10 too.
function pickRpe(sessionType: SessionType, random: () => number): number {
  if (random() < ODD_DAY_CHANCE) {
    // random() is in [0, 1), so this gives an integer from 1 to 10
    return 1 + Math.floor(random() * 10);
  }
  const range = RPE_RANGES[sessionType];
  // + 1 because both ends count: 3 to 6 is 4 values
  return range.min + Math.floor(random() * (range.max - range.min + 1));
}

// What one Athlete did in one session. Every kind of session is logged the same way.
function makeLog(
  sessionId: string,
  athleteId: string,
  date: Date,
  sessionType: SessionType,
  random: () => number,
): GeneratedLog {
  return {
    sessionId,
    athleteId,
    performedAt: date,
    rpe: pickRpe(sessionType, random),
    // 5 km at 6:00 min/km, an easy run
    distanceM: 5000,
    durationS: 1800,
    completed: true,
  };
}

export function generateSessionHistory(params: SessionHistoryParams): SessionHistory {
  const sessions: GeneratedSession[] = [];
  const logs: GeneratedLog[] = [];
  let number = params.firstSessionNumber;

  // A session of one Athlete (no group) and its only log, which is theirs
  function addIndividualSession(
    athleteId: string,
    date: Date,
    origin: SessionOrigin,
    customizesSessionId: string | null,
  ): void {
    const id = sessionId(number);
    const sessionType = pickSessionType(params.random);
    number++;
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
      const id = sessionId(number);
      const date = sessionDate(params.start, week, day);
      const sessionType = pickSessionType(params.random);
      number++;

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

    // Free Sessions: each Athlete adds 0, 1 or 2 of their own, any day
    for (const athleteId of params.athleteIds) {
      const count = Math.floor(params.random() * 3);
      for (let i = 0; i < count; i++) {
        const day = Math.floor(params.random() * 7);
        addIndividualSession(athleteId, sessionDate(params.start, week, day), "free", null);
      }
    }

    // Direct Customized Sessions: the Manager prescribes up to 2 new ones,
    // not adapted from a group session (#68). Two draws keep 2 rare.
    for (const athleteId of params.athleteIds) {
      for (let i = 0; i < 2; i++) {
        if (params.random() < PRESCRIBE_CHANCE) {
          const day = Math.floor(params.random() * 7);
          addIndividualSession(athleteId, sessionDate(params.start, week, day), "customized", null);
        }
      }
    }
  }

  return { sessions, logs };
}

// Monday 00:00 UTC of the 6 full weeks that end just before today's week
export function historyStart(today: Date): Date {
  // getUTCDay() starts on Sunday (0); this makes Monday 0 and Sunday 6
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  // A negative day is fine: Date.UTC moves back the months, like mktime in C
  const day = today.getUTCDate() - daysSinceMonday - WEEKS * 7;
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
}
