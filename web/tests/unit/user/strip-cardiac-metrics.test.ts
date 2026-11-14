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

  it("removes cardiac, case-variant, nested and unknown keys while keeping incompletion_reason", () => {
    const input = {
      incompletion_reason: "fatigue",
      avgHeartRate: 165,
      HeartRate: 170,
      hrv: 52,
      metrics: { avgHeartRate: 160 },
      unknown_field: "something",
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
