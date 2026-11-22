// Saves a group's demo session history once (#226). seed.ts runs on every
// make dev start and on every make seed: a group that already has its history
// is left exactly as it is, so logs typed by hand on demo sessions and Events
// linked to them survive the next run.
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { SessionHistory } from "./session-logs";

// rangeIds: every session id the group may use, not only the ids of this
// history. One session with any of them means "this group already has history".
// consent: the history stores RPE, and RPE is only stored with health consent
// (Privacy Policy), so these Athletes get it, dated at, in the same transaction
// that creates the history. Only then, not on every run: a later run leaves a
// withdrawal as it is. It comes back only if the group loses its whole history
// (no session of the range left, e.g. the demo club deleted, #217): the history
// is then created again from scratch, with its consent.
// Returns true if it created the history, false if it was already there.
export async function ensureSessionHistory(
  db: PrismaClient,
  input: { rangeIds: string[]; history: SessionHistory; consent: { athleteIds: string[]; at: Date } },
): Promise<boolean> {
  const existing = await db.trainingSession.findFirst({
    where: { id: { in: input.rangeIds } },
    select: { id: true },
  });
  if (existing) {
    return false;
  }

  const logRows = [];
  for (const log of input.history.logs) {
    // incompletionReason is not a column: it goes in extra, with the name of
    // the export spec (docs/gdpr/export-spec.md 3.3). Completed logs have no
    // extra (undefined leaves the column null).
    const { incompletionReason, ...columns } = log;
    logRows.push({
      ...columns,
      extra: incompletionReason === null ? undefined : { incompletion_reason: incompletionReason },
    });
  }
  // All or nothing. Sessions before logs: every log points to one.
  await db.$transaction([
    // Only who has none: an earlier consent keeps its date. Both fields
    // together: CHECK users_health_consent_both_or_neither
    db.user.updateMany({
      where: { id: { in: input.consent.athleteIds }, healthConsentAt: null },
      data: { healthConsentAt: input.consent.at, healthConsentVersion: 1 },
    }),
    db.trainingSession.createMany({ data: input.history.sessions }),
    db.sessionLog.createMany({ data: logRows }),
  ]);
  return true;
}
