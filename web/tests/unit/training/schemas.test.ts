import { describe, expect, it } from "vitest";
import {
  MAX_DAY_OFFSET,
  MAX_DURATION_SECONDS,
  MAX_PACE_SECONDS,
  POSTGRES_INT_MAX,
  incompletionReasonSchema,
  rpeSchema,
  sessionLogExtraSchema,
  sessionLogSchema,
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

describe("sessionLogExtraSchema", () => {
  it("accepts valid closed incompletion reasons and in-range heart rate metrics", () => {
    expect(incompletionReasonSchema.parse("time_constraints")).toBe("time_constraints");
    expect(
      sessionLogExtraSchema.parse({
        incompletion_reason: "equipment_issue",
        avg_heart_rate_bpm: 148,
        max_heart_rate_bpm: 175,
      }),
    ).toEqual({
      incompletion_reason: "equipment_issue",
      avg_heart_rate_bpm: 148,
      max_heart_rate_bpm: 175,
    });
    expect(
      sessionLogExtraSchema.parse({
        avg_heart_rate_bpm: 30,
        max_heart_rate_bpm: 250,
      }),
    ).toEqual({
      avg_heart_rate_bpm: 30,
      max_heart_rate_bpm: 250,
    });
  });

  it("rejects unknown keys, removed metrics, free text, out-of-range or decimal values, and max < avg heart rate", () => {
    expect(sessionLogExtraSchema.safeParse({ notes: "me dolía la rodilla" }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ elevation_gain_m: 320 }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ cadence_spm: 176 }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ incompletion_reason: "tired" }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ avg_heart_rate_bpm: 29 }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ avg_heart_rate_bpm: 251 }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ avg_heart_rate_bpm: 148.5 }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ max_heart_rate_bpm: 29 }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ max_heart_rate_bpm: 251 }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ max_heart_rate_bpm: 175.5 }).success).toBe(false);
    expect(sessionLogExtraSchema.safeParse({ avg_heart_rate_bpm: 160, max_heart_rate_bpm: 150 }).success).toBe(false);
  });
});

describe("sessionLogSchema", () => {
  it("accepts completed or incomplete logs with valid rpe (1..10 or null) and defaults omitted fields to null", () => {
    expect(rpeSchema.parse(1)).toBe(1);
    expect(rpeSchema.parse(10)).toBe(10);
    expect(sessionLogSchema.parse({ completed: true, rpe: null })).toEqual({
      completed: true,
      rpe: null,
      distanceM: null,
      durationS: null,
      extra: null,
    });
    expect(
      sessionLogSchema.parse({
        completed: true,
        rpe: 7,
        distanceM: 10000,
        durationS: 3000,
        extra: { avg_heart_rate_bpm: 150 },
      }),
    ).toEqual({
      completed: true,
      rpe: 7,
      distanceM: 10000,
      durationS: 3000,
      extra: { avg_heart_rate_bpm: 150 },
    });
    expect(
      sessionLogSchema.parse({
        completed: false,
        extra: { incompletion_reason: "time_constraints" },
      }),
    ).toEqual({
      completed: false,
      rpe: null,
      distanceM: null,
      durationS: null,
      extra: { incompletion_reason: "time_constraints" },
    });
  });

  it("rejects completed logs with incompletion_reason, rpe outside 1..10, decimals, non-positive distance/duration, and unknown keys", () => {
    expect(
      sessionLogSchema.safeParse({
        completed: true,
        extra: { incompletion_reason: "time_constraints" },
      }).success,
    ).toBe(false);
    expect(rpeSchema.safeParse(0).success).toBe(false);
    expect(rpeSchema.safeParse(11).success).toBe(false);
    expect(rpeSchema.safeParse(6.5).success).toBe(false);
    expect(sessionLogSchema.safeParse({ completed: true, rpe: 0 }).success).toBe(false);
    expect(sessionLogSchema.safeParse({ completed: true, rpe: 11 }).success).toBe(false);
    expect(sessionLogSchema.safeParse({ completed: true, rpe: 6.5 }).success).toBe(false);
    expect(sessionLogSchema.safeParse({ completed: true, distanceM: 0 }).success).toBe(false);
    expect(sessionLogSchema.safeParse({ completed: true, durationS: MAX_DURATION_SECONDS + 1 }).success).toBe(false);
    expect(sessionLogSchema.safeParse({ completed: true, unknownField: 1 }).success).toBe(false);
  });
});
