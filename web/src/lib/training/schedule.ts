import type { TrainingSessionData } from './types';

export function excludeSubstitutedGroupSessions(
	sessions: readonly TrainingSessionData[],
	loggedSessionIds: ReadonlySet<string>,
): TrainingSessionData[] {

	const substitutedIds = new Set<string>();

	for (const session of sessions) {
		if (session.origin === "customized" && session.customizesSessionId !== null) {
			substitutedIds.add(session.customizesSessionId);
		}
	}

	const result: TrainingSessionData[] = [];

	for (const session of sessions) {
		if (session.origin === "template" && substitutedIds.has(session.id) && !loggedSessionIds.has(session.id)) {
			continue;
		}
		result.push(session);
	}

	return result;
}
