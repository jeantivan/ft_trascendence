// Generates a simulated training history (TrainingSessions + SessionLogs) for
// the demo seed, so analytics can be built before Athletes log real sessions.
// Pure: it never touches the database; seed.ts saves what it returns.

export interface SessionHistoryParams {
  athleteId: string;
  orgId: string;
  groupId: string;
  // First day of the 6 weeks
  start: Date;
  // Returns a number in [0, 1), like Math.random. Tests pass a fixed one.
  random: () => number;
}

export interface GeneratedSession {
  id: string;
  scheduledAt: Date;
}

export interface GeneratedLog {
  // id of one of the generated sessions
  sessionId: string;
  performedAt: Date;
  // 1-10, like SessionLog.rpe
  rpe: number;
  distanceM: number;
  durationS: number;
}

export interface SessionHistory {
  sessions: GeneratedSession[];
  logs: GeneratedLog[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 6;
// Monday, Wednesday and Saturday of each week
const TRAINING_DAYS = [0, 2, 5];
const FIRST_SESSION_NUMBER = 101;

// Same format as seed/ids.ts, because sessions.id is a Postgres uuid column.
// TODO: two Athletes would get the same ids; fix before wiring into seed.ts.
function sessionId(number: number): string {
  return "00000000-0000-4000-8000-" + String(number).padStart(12, "0");
}

export function generateSessionHistory(params: SessionHistoryParams): SessionHistory {
  const sessions: GeneratedSession[] = [];
  const logs: GeneratedLog[] = [];
  let number = FIRST_SESSION_NUMBER;

  for (let week = 0; week < WEEKS; week++) {
    for (const day of TRAINING_DAYS) {
      const id = sessionId(number);
      const date = new Date(params.start.getTime() + (week * 7 + day) * DAY_MS);
      number++;

      sessions.push({ id, scheduledAt: date });
      logs.push({
        sessionId: id,
        performedAt: date,
        // random() is in [0, 1), so this gives an integer from 1 to 10
        rpe: 1 + Math.floor(params.random() * 10),
        // 5 km at 6:00 min/km, an easy run
        distanceM: 5000,
        durationS: 1800,
      });
    }
  }

  return { sessions, logs };
}
