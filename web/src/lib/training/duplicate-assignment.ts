import type { SessionType } from "@/generated/prisma/client";

export interface SessionSignature {
  scheduledAt: Date;
  sessionType: SessionType;
}

export function countSessionSignatures(
  sessions: ReadonlyArray<SessionSignature>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const key = `${session.scheduledAt.getTime()}:${session.sessionType}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// Decision (#238 row 10): prevents double-submit / concurrent duplicate copies for the exact same
// (groupId, sourceTemplateId, startDate) without requiring a schema migration, by checking whether
// all planned (scheduledAt, sessionType) signatures already exist in that group for that template.
//
// Known limit (#238): because each assignment's startDate is not stored in a separate column,
// assigning a periodic template (e.g. rodaje on dayOffset 0 and 7) on 2026-06-01 and 2026-06-15
// and then on 2026-06-08 also triggers TrainingConflictError (all planned signatures already exist
// from the surrounding assignments).
export function isDuplicateTemplateAssignment(
  planned: ReadonlyArray<SessionSignature>,
  existing: ReadonlyArray<SessionSignature>
): boolean {
  if (planned.length === 0) {
    return false;
  }
  const plannedCounts = countSessionSignatures(planned);
  const existingCounts = countSessionSignatures(existing);
  for (const [signature, requiredCount] of plannedCounts.entries()) {
    if ((existingCounts.get(signature) ?? 0) < requiredCount) {
      return false;
    }
  }
  return true;
}
