import { describe, expect, it } from "vitest";
import {
  MAX_DAY_OFFSET,
  MAX_DURATION_SECONDS,
  MAX_PACE_SECONDS,
  POSTGRES_INT_MAX,
  sessionTypeSchema,
  trainingTemplateNameSchema,
  trainingTemplateSchema,
} from "@/lib/training/schemas";

describe("trainingTemplateNameSchema", () => {
  it("trims whitespace and accepts 1..100 characters", () => {
    expect(trainingTemplateNameSchema.parse("  Plan 10K  ")).toBe("Plan 10K");
  });

  it("rejects empty or >100 character names", () => {
    expect(() => trainingTemplateNameSchema.parse("   ")).toThrow();
    expect(() => trainingTemplateNameSchema.parse("a".repeat(101))).toThrow();
  });
});

describe("sessionTypeSchema", () => {
  it("accepts valid session types and rejects unknown ones", () => {
    expect(sessionTypeSchema.parse("rodaje")).toBe("rodaje");
    expect(sessionTypeSchema.parse("tirada_larga")).toBe("tirada_larga");
    expect(() => sessionTypeSchema.parse("sprint")).toThrow();
  });
});

describe("trainingTemplateSchema", () => {
  it("normalizes position 0..n-1, defaults omitted targets to null, and allows duplicate dayOffset", () => {
    const parsed = trainingTemplateSchema.parse({
      name: "  Semana base  ",
      sessions: [
        { sessionType: "rodaje", dayOffset: 0 },
        {
          sessionType: "cuestas",
          dayOffset: 0,
          targetDistanceM: null,
        },
        {
          sessionType: "tirada_larga",
          dayOffset: MAX_DAY_OFFSET,
          targetDistanceM: 21097,
          targetDurationS: MAX_DURATION_SECONDS,
          targetPaceSPerKm: MAX_PACE_SECONDS,
        },
      ],
    });
    expect(parsed.name).toBe("Semana base");
    expect(parsed.sessions.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(parsed.sessions[0]).toMatchObject({
      targetDistanceM: null,
      targetDurationS: null,
      targetPaceSPerKm: null,
    });
  });

  it("rejects unexpected keys such as client-supplied position or unknown template fields", () => {
    expect(
      trainingTemplateSchema.safeParse({
        name: "Plan",
        sessions: [{ sessionType: "rodaje", dayOffset: 0, position: 5 }],
      }).success,
    ).toBe(false);
    expect(
      trainingTemplateSchema.safeParse({
        name: "Plan",
        extra: true,
        sessions: [{ sessionType: "rodaje", dayOffset: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rejects empty sessions or negative dayOffset", () => {
    expect(() =>
      trainingTemplateSchema.parse({ name: "Plan", sessions: [] }),
    ).toThrow();
    expect(() =>
      trainingTemplateSchema.parse({
        name: "Plan",
        sessions: [{ sessionType: "rodaje", dayOffset: -1 }],
      }),
    ).toThrow();
  });

  it("rejects dayOffset, duration, pace and distance exceeding schema limits", () => {
    expect(() =>
      trainingTemplateSchema.parse({
        name: "Plan",
        sessions: [{ sessionType: "rodaje", dayOffset: MAX_DAY_OFFSET + 1 }],
      }),
    ).toThrow();
    expect(() =>
      trainingTemplateSchema.parse({
        name: "Plan",
        sessions: [
          {
            sessionType: "rodaje",
            dayOffset: 0,
            targetDurationS: MAX_DURATION_SECONDS + 1,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      trainingTemplateSchema.parse({
        name: "Plan",
        sessions: [
          {
            sessionType: "rodaje",
            dayOffset: 0,
            targetPaceSPerKm: MAX_PACE_SECONDS + 1,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      trainingTemplateSchema.parse({
        name: "Plan",
        sessions: [
          {
            sessionType: "rodaje",
            dayOffset: 0,
            targetDistanceM: POSTGRES_INT_MAX + 1,
          },
        ],
      }),
    ).toThrow();
  });
});
