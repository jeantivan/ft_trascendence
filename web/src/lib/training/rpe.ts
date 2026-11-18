/**
 * Escala de Borg Modificada (Borg CR-10) para esfuerzo percibido (RPE 1-10)
 * y orientación fisiológica (suave 4-5, duro 7-9 según CONTEXT.md).
 */
export const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type RpeValue = (typeof RPE_VALUES)[number];

export type RpeTier = "low" | "moderate" | "hard" | "max";

export interface RpeDescriptor {
  value: RpeValue;
  label: string;
  guidance: string;
  tier: RpeTier;
}

export function rpeTierOf(value: RpeValue): RpeTier {
  if (value <= 3) return "low";
  if (value <= 6) return "moderate";
  if (value <= 8) return "hard";
  return "max";
}

export const RPE_DESCRIPTORS: Record<RpeValue, RpeDescriptor> = {
  1: {
    value: 1,
    label: "Muy suave / Mínimo",
    guidance: "Esfuerzo casi nulo, respiración completamente relajada",
    tier: rpeTierOf(1),
  },
  2: {
    value: 2,
    label: "Fácil / Muy ligero",
    guidance: "Actividad muy cómoda, permite hablar sin ningún esfuerzo",
    tier: rpeTierOf(2),
  },
  3: {
    value: 3,
    label: "Ligero",
    guidance: "Esfuerzo bajo y sostenible durante mucho tiempo",
    tier: rpeTierOf(3),
  },
  4: {
    value: 4,
    label: "Moderado",
    guidance: "Ritmo aeróbico cómodo y estable; conversación fluida",
    tier: rpeTierOf(4),
  },
  5: {
    value: 5,
    label: "Algo duro",
    guidance: "Esfuerzo aeróbico sostenido; frases cortas al hablar",
    tier: rpeTierOf(5),
  },
  6: {
    value: 6,
    label: "Duro (controlado)",
    guidance: "Zona de umbral controlado; respiración profunda y rítmica",
    tier: rpeTierOf(6),
  },
  7: {
    value: 7,
    label: "Duro / Intenso",
    guidance: "Alta exigencia cardiovascular; hablar cuesta esfuerzo",
    tier: rpeTierOf(7),
  },
  8: {
    value: 8,
    label: "Muy duro",
    guidance: "Esfuerzo muy intenso, solo sostenible en bloques cortos",
    tier: rpeTierOf(8),
  },
  9: {
    value: 9,
    label: "Extremadamente duro",
    guidance: "Cerca del límite fisiológico, respiración máxima",
    tier: rpeTierOf(9),
  },
  10: {
    value: 10,
    label: "Esfuerzo máximo",
    guidance: "Esfuerzo máximo absoluto sin reserva posible",
    tier: rpeTierOf(10),
  },
} as const;

export const RPE_GUIDANCE = {
  easyRuns: { min: 4, max: 5 },
  hardSessions: { min: 7, max: 9 },
} as const;
