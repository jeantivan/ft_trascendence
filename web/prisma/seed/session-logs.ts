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

// Same format as seed/ids.ts, because sessions.id is a Postgres uuid column
const FIRST_SESSION_ID = "00000000-0000-4000-8000-000000000101";

export function generateSessionHistory(params: SessionHistoryParams): SessionHistory {
  return {
    sessions: [{ id: FIRST_SESSION_ID, scheduledAt: params.start }],
    // 5 km at 6:00 min/km, an easy run
    logs: [
      {
        sessionId: FIRST_SESSION_ID,
        performedAt: params.start,
        // random() is in [0, 1), so this gives an integer from 1 to 10
        rpe: 1 + Math.floor(params.random() * 10),
        distanceM: 5000,
        durationS: 1800,
      },
    ],
  };
}
