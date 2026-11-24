import type { SessionType } from "@/generated/prisma/client";
import type { TemplateSessionData } from "@/lib/training/types";
import {
  formatMetersToKm,
  formatSecondsPerKmToPace,
  formatSecondsToDuration,
} from "@/lib/training/units";

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  rodaje: "Rodaje",
  intervalos: "Intervalos",
  cuestas: "Cuestas",
  tirada_larga: "Tirada larga",
  fartlek: "Fartlek",
};

export const SESSION_TYPE_OPTIONS: ReadonlyArray<{
  value: SessionType;
  label: string;
}> = (Object.entries(SESSION_TYPE_LABELS) as Array<[SessionType, string]>).map(
  ([value, label]) => ({ value, label }),
);

export function formatSessionMetrics(session: TemplateSessionData): string {
  const parts: string[] = [];

  if (session.targetDistanceM != null) {
    parts.push(`${formatMetersToKm(session.targetDistanceM)} km`);
  }
  if (session.targetPaceSPerKm != null) {
    parts.push(`${formatSecondsPerKmToPace(session.targetPaceSPerKm)} /km`);
  }
  if (session.targetDurationS != null) {
    parts.push(formatSecondsToDuration(session.targetDurationS));
  }

  return parts.length > 0 ? parts.join(" · ") : "Sin objetivos definidos";
}
