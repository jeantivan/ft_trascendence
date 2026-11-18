import { describe, expect, it } from "vitest";
import {
  RPE_DESCRIPTORS,
  RPE_GUIDANCE,
  RPE_VALUES,
  rpeTierOf,
} from "@/lib/training/rpe";

describe("RPE descriptors catalog (Borg CR-10)", () => {
  it("defines all 10 modified Borg levels (1..10) with labels and tiers", () => {
    expect(RPE_VALUES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(Object.keys(RPE_DESCRIPTORS).map(Number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);

    expect(RPE_DESCRIPTORS[1].label).toBe("Muy suave / Mínimo");
    expect(RPE_DESCRIPTORS[6].label).toBe("Duro (controlado)");
    expect(RPE_DESCRIPTORS[10].label).toBe("Esfuerzo máximo");

    for (const value of RPE_VALUES) {
      expect(RPE_DESCRIPTORS[value].tier).toBe(rpeTierOf(value));
    }
  });

  it("includes CONTEXT.md physiological guidance ranges (4-5 easy, 7-9 hard)", () => {
    expect(RPE_GUIDANCE.easyRuns).toEqual({ min: 4, max: 5 });
    expect(RPE_GUIDANCE.hardSessions).toEqual({ min: 7, max: 9 });
  });
});
