import { describe, expect, it } from "vitest";
import { stripCardiacMetrics } from "@/lib/user/strip-cardiac-metrics";

describe("stripCardiacMetrics", () => {
  it("returns null for non-object, null or undefined input", () => {
    expect(stripCardiacMetrics(null)).toBeNull();
    expect(stripCardiacMetrics(undefined)).toBeNull();
    expect(stripCardiacMetrics("string")).toBeNull();
    expect(stripCardiacMetrics([1, 2, 3])).toBeNull();
  });

  it("preserves non-cardiac fields like incompletion_reason", () => {
    const input = { incompletion_reason: "injury" };
    expect(stripCardiacMetrics(input)).toEqual({ incompletion_reason: "injury" });
  });

  it("removes cardiac keys while keeping non-cardiac keys", () => {
    const input = {
      incompletion_reason: "fatigue",
      avgHeartRate: 165,
      maxHr: 185,
      bpm: 170,
    };
    expect(stripCardiacMetrics(input)).toEqual({
      incompletion_reason: "fatigue",
    });
  });

  it("returns null if only cardiac keys were present", () => {
    const input = {
      avgHeartRate: 150,
      heart_rate: 155,
      max_hr: 180,
    };
    expect(stripCardiacMetrics(input)).toBeNull();
  });
});
