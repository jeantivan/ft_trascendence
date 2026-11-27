import type { TrainingSessionData } from "./types";

// Known limit: checks whether any SessionLog exists at read time without comparing
// timestamps against the customized session's creation, so a log created later on
// the template session also keeps both sessions visible.
export function excludeSubstitutedGroupSessions(
  sessions: readonly TrainingSessionData[],
  loggedSessionIds: ReadonlySet<string>
): TrainingSessionData[] {
  const substitutedIds = new Set<string>();

  for (const session of sessions) {
    if (
      session.origin === "customized" &&
      session.customizesSessionId !== null
    ) {
      substitutedIds.add(session.customizesSessionId);
    }
  }

  const result: TrainingSessionData[] = [];

  for (const session of sessions) {
    if (
      session.origin === "template" &&
      substitutedIds.has(session.id) &&
      !loggedSessionIds.has(session.id)
    ) {
      continue;
    }
    result.push(session);
  }

  return result;
}
