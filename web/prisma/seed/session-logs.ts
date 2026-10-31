// Generates a simulated training history (TrainingSessions + SessionLogs) for
// the demo seed, so analytics can be built before Athletes log real sessions.
// Pure: it never touches the database; seed.ts saves what it returns.
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
  athleteId: string | null;
  orgId: string;
  groupId: string | null;
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
// Monday, Wednesday and Saturday of each week
const TRAINING_DAYS = [0, 2, 5];
// How often the Manager adapts a group session for one Athlete
const CUSTOMIZE_CHANCE = 0.1;
// How often the Manager prescribes a new individual session (each of 2 draws a week)
const PRESCRIBE_CHANCE = 0.1;

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

// What one Athlete did in one session. Every kind of session is logged the same way.
function makeLog(sessionId: string, athleteId: string, date: Date, random: () => number): GeneratedLog {
  return {
    sessionId,
    athleteId,
    performedAt: date,
    // random() is in [0, 1), so this gives an integer from 1 to 10
    rpe: 1 + Math.floor(random() * 10),
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

  for (let week = 0; week < WEEKS; week++) {
    for (const day of TRAINING_DAYS) {
      const id = sessionId(number);
      const date = sessionDate(params.start, week, day);
      number++;

      sessions.push({
        id,
        athleteId: null,
        orgId: params.orgId,
        groupId: params.groupId,
        customizesSessionId: null,
        origin: "template",
        // An easy run, like the 5 km at 6:00 min/km of the logs
        sessionType: "rodaje",
        scheduledAt: date,
      });
      // One log per Athlete: each one rates the same session differently
      for (const athleteId of params.athleteIds) {
        // Sometimes the Manager adapts this session for one Athlete. The copy
        // replaces it for them (#68), so their log goes on the copy instead.
        if (params.random() < CUSTOMIZE_CHANCE) {
          const copyId = sessionId(number);
          number++;
          sessions.push({
            id: copyId,
            athleteId,
            orgId: params.orgId,
            groupId: null,
            customizesSessionId: id,
            origin: "customized",
            sessionType: "rodaje",
            scheduledAt: date,
          });
          logs.push(makeLog(copyId, athleteId, date, params.random));        } else {
          logs.push(makeLog(id, athleteId, date, params.random));
        }
      }
    }

    // Free Sessions: each Athlete adds 0, 1 or 2 of their own, any day
    for (const athleteId of params.athleteIds) {
      const count = Math.floor(params.random() * 3);
      for (let i = 0; i < count; i++) {
        const day = Math.floor(params.random() * 7);
        const id = sessionId(number);
        const date = sessionDate(params.start, week, day);
        number++;

        sessions.push({
          id,
          athleteId,
          orgId: params.orgId,
          groupId: null,
          customizesSessionId: null,
          origin: "free",
          sessionType: "rodaje",
          scheduledAt: date,
        });
        // Only its owner logs a Free Session
        logs.push(makeLog(id, athleteId, date, params.random));
      }
    }

    // Direct Customized Sessions: the Manager prescribes up to 2 new ones,
    // not adapted from a group session (#68). Two draws keep 2 rare.
    for (const athleteId of params.athleteIds) {
      for (let i = 0; i < 2; i++) {
        if (params.random() < PRESCRIBE_CHANCE) {
          const day = Math.floor(params.random() * 7);
          const id = sessionId(number);
          const date = sessionDate(params.start, week, day);
          number++;

          sessions.push({
            id,
            athleteId,
            orgId: params.orgId,
            groupId: null,
            customizesSessionId: null,
            origin: "customized",
            sessionType: "rodaje",
            scheduledAt: date,
          });
          logs.push(makeLog(id, athleteId, date, params.random));
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
