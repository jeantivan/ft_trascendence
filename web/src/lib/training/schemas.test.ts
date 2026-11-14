import { describe, expect, it } from "vitest";
import {
  POSTGRES_INT_MAX,
  sessionTypeSchema,
  trainingTemplateNameSchema,
  trainingTemplateSchema,
} from "./schemas";

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
  it("normalizes position 0..n-1 and allows duplicate dayOffset", () => {
    const parsed = trainingTemplateSchema.parse({
      name: "  Semana base  ",
      sessions: [
        { sessionType: "rodaje", dayOffset: 0, position: 5 },
        { sessionType: "cuestas", dayOffset: 0, position: 9 },
        { sessionType: "tirada_larga", dayOffset: 6 },
      ],
    });
    expect(parsed.name).toBe("Semana base");
    expect(parsed.sessions.map((s) => s.position)).toEqual([0, 1, 2]);
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

  it("rejects numbers exceeding 32-bit signed int max", () => {
    expect(() =>
      trainingTemplateSchema.parse({
        name: "Plan",
        sessions: [
          { sessionType: "rodaje", dayOffset: POSTGRES_INT_MAX + 1 },
        ],
      }),
    ).toThrow();
  });
});
