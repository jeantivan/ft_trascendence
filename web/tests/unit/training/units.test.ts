import { describe, expect, it } from "vitest";
import {
  MAX_DAY_OFFSET,
  MAX_DURATION_SECONDS,
  MAX_PACE_SECONDS,
  POSTGRES_INT_MAX,
} from "@/lib/training/schemas";
import {
  calculateAveragePaceSecondsPerKm,
  computeScheduledAtUtc,
  durationToSecondsSchema,
  formatAveragePace,
  formatMetersToKm,
  formatSecondsPerKmToPace,
  formatSecondsToDuration,
  isoCalendarDaySchema,
  kmToMetersSchema,
  paceToSecondsSchema,
  parseDurationToSeconds,
  parseIsoCalendarDay,
  parseKmToMeters,
  parsePaceToSecondsPerKm,
} from "@/lib/training/units";

describe("distance converters", () => {
  it("parses km with dot or comma up to 3 decimals into integer meters", () => {
    expect(parseKmToMeters("10")).toBe(10000);
    expect(parseKmToMeters("10.5")).toBe(10500);
    expect(parseKmToMeters("5,250")).toBe(5250);
    expect(parseKmToMeters("0.001")).toBe(1);
    expect(parseKmToMeters("1.005")).toBe(1005);
  });

  it("rejects invalid, zero, negative or >3-decimal km inputs with user-friendly units", () => {
    expect(() => parseKmToMeters("0")).toThrow(/mayor que 0 km/i);
    expect(() => parseKmToMeters("-5")).toThrow();
    expect(() => parseKmToMeters("1.2345")).toThrow();
    expect(() => parseKmToMeters("abc")).toThrow();
  });

  it("rejects meters exceeding 32-bit signed int limit", () => {
    expect(() => parseKmToMeters("2147484")).toThrow(/máximo permitido/i);
  });

  it("validates via kmToMetersSchema.safeParse without throwing", () => {
    expect(kmToMetersSchema.safeParse("1,5")).toEqual({
      success: true,
      data: 1500,
    });
    const invalid = kmToMetersSchema.safeParse("0");
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toMatch(/0 km/i);
    }
  });

  it("formats integer meters to km without trailing zeros", () => {
    expect(formatMetersToKm(10000)).toBe("10");
    expect(formatMetersToKm(10500)).toBe("10.5");
    expect(formatMetersToKm(5250)).toBe("5.25");
    expect(formatMetersToKm(1)).toBe("0.001");
  });

  it("rejects non-positive or overflowing meters on format", () => {
    expect(() => formatMetersToKm(0)).toThrow();
    expect(() => formatMetersToKm(POSTGRES_INT_MAX + 1)).toThrow();
  });
});

describe("pace converters", () => {
  it("parses m:ss and mm:ss into integer seconds per km", () => {
    expect(parsePaceToSecondsPerKm("4:30")).toBe(270);
    expect(parsePaceToSecondsPerKm("04:05")).toBe(245);
    expect(parsePaceToSecondsPerKm("99:59")).toBe(MAX_PACE_SECONDS);
  });

  it("rejects invalid pace formats or zero", () => {
    expect(() => parsePaceToSecondsPerKm("0:00")).toThrow();
    expect(() => parsePaceToSecondsPerKm("4:60")).toThrow();
    expect(() => parsePaceToSecondsPerKm("4.30")).toThrow();
    expect(() => parsePaceToSecondsPerKm("100:00")).toThrow();
  });

  it("validates via paceToSecondsSchema.safeParse", () => {
    expect(paceToSecondsSchema.safeParse("04:05")).toEqual({
      success: true,
      data: 245,
    });
    expect(paceToSecondsSchema.safeParse("0:00").success).toBe(false);
  });

  it("formats seconds per km to m:ss and preserves round-trip symmetry", () => {
    expect(formatSecondsPerKmToPace(270)).toBe("4:30");
    expect(formatSecondsPerKmToPace(245)).toBe("4:05");
    expect(formatSecondsPerKmToPace(MAX_PACE_SECONDS)).toBe("99:59");
    expect(
      parsePaceToSecondsPerKm(formatSecondsPerKmToPace(MAX_PACE_SECONDS)),
    ).toBe(MAX_PACE_SECONDS);
  });

  it("rejects pace over 99:59 when formatting", () => {
    expect(() => formatSecondsPerKmToPace(MAX_PACE_SECONDS + 1)).toThrow();
  });
});

describe("duration converters", () => {
  it("parses mm:ss (00-59), hh:mm:ss and integer minutes into seconds", () => {
    expect(parseDurationToSeconds("45")).toBe(2700);
    expect(parseDurationToSeconds("75")).toBe(4500);
    expect(parseDurationToSeconds("12:30")).toBe(750);
    expect(parseDurationToSeconds("59:59")).toBe(3599);
    expect(parseDurationToSeconds("01:05:10")).toBe(3910);
    expect(parseDurationToSeconds("99:59:59")).toBe(MAX_DURATION_SECONDS);
  });

  it("rejects >=60 minutes in mm:ss, zero, invalid formats, or durations >= 100h", () => {
    expect(() => parseDurationToSeconds("0")).toThrow(
      /duración debe ser mayor que 0/i,
    );
    expect(() => parseDurationToSeconds("75:00")).toThrow(/75 o 1:15:00/);
    expect(() => parseDurationToSeconds("100:00")).toThrow(/75 o 1:15:00/);
    expect(() => parseDurationToSeconds("12:60")).toThrow();
    expect(() => parseDurationToSeconds("6000")).toThrow(/99:59:59/);
  });

  it("validates via durationToSecondsSchema.safeParse", () => {
    expect(durationToSecondsSchema.safeParse("1:15:00")).toEqual({
      success: true,
      data: 4500,
    });
    const invalid = durationToSecondsSchema.safeParse("75:00");
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toMatch(/75 o 1:15:00/);
    }
  });

  it("formats seconds to mm:ss (< 1h) or hh:mm:ss (>= 1h) with full round-trip symmetry", () => {
    expect(formatSecondsToDuration(750)).toBe("12:30");
    expect(formatSecondsToDuration(3910)).toBe("01:05:10");
    expect(formatSecondsToDuration(MAX_DURATION_SECONDS)).toBe("99:59:59");
    expect(
      parseDurationToSeconds(formatSecondsToDuration(MAX_DURATION_SECONDS)),
    ).toBe(MAX_DURATION_SECONDS);
    expect(() => formatSecondsToDuration(MAX_DURATION_SECONDS + 1)).toThrow();
  });
});

describe("parseIsoCalendarDay and computeScheduledAtUtc", () => {
  it("parses valid dates from 1970 onward and rejects impossible or pre-1970 dates", () => {
    expect(parseIsoCalendarDay("1970-01-01")).toEqual({
      year: 1970,
      month: 1,
      day: 1,
    });
    expect(parseIsoCalendarDay("2026-02-28")).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    expect(() => parseIsoCalendarDay("1969-12-31")).toThrow(/1970/);
    expect(() => parseIsoCalendarDay("0050-02-28")).toThrow(/1970/);
    expect(() => parseIsoCalendarDay("2026-02-29")).toThrow();
    expect(() => parseIsoCalendarDay("2026-02-31")).toThrow();
    expect(() => parseIsoCalendarDay("2026-13-01")).toThrow();
    expect(() => parseIsoCalendarDay("2026-04-31")).toThrow();
  });

  it("validates via isoCalendarDaySchema.safeParse without throwing", () => {
    expect(isoCalendarDaySchema.safeParse(" 2026-03-28 ")).toEqual({
      success: true,
      data: { year: 2026, month: 3, day: 28 },
    });
    const invalid = isoCalendarDaySchema.safeParse("1969-12-31");
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toMatch(/1970/);
    }
    expect(isoCalendarDaySchema.safeParse("2026-02-31").success).toBe(false);
  });

  it("computes 00:00 in club timezone across both spring and autumn DST transitions", () => {
    // Spring: Europe/Madrid 2026-03-29 switches CET (+01:00) -> CEST (+02:00) at 02:00
    expect(
      computeScheduledAtUtc("2026-03-28", 0, "Europe/Madrid").toISOString(),
    ).toBe("2026-03-27T23:00:00.000Z");
    expect(
      computeScheduledAtUtc("2026-03-28", 2, "Europe/Madrid").toISOString(),
    ).toBe("2026-03-29T22:00:00.000Z");

    // Autumn: Europe/Madrid 2026-10-25 switches CEST (+02:00) -> CET (+01:00) at 03:00
    expect(
      computeScheduledAtUtc("2026-10-24", 0, "Europe/Madrid").toISOString(),
    ).toBe("2026-10-23T22:00:00.000Z");
    expect(
      computeScheduledAtUtc("2026-10-24", 1, "Europe/Madrid").toISOString(),
    ).toBe("2026-10-24T22:00:00.000Z");
    expect(
      computeScheduledAtUtc("2026-10-24", 2, "Europe/Madrid").toISOString(),
    ).toBe("2026-10-25T23:00:00.000Z");
  });

  it("rejects negative or excessive dayOffset and invalid date format", () => {
    expect(() =>
      computeScheduledAtUtc("2026-03-28", -1, "Europe/Madrid"),
    ).toThrow();
    expect(() =>
      computeScheduledAtUtc("28/03/2026", 0, "Europe/Madrid"),
    ).toThrow();
    expect(() =>
      computeScheduledAtUtc("2026-03-28", MAX_DAY_OFFSET + 1, "Europe/Madrid"),
    ).toThrow();
  });
});

describe("average pace calculation", () => {
  it("computes and formats average pace in min/km from distanceM and durationS", () => {
    expect(calculateAveragePaceSecondsPerKm(10000, 3000)).toBe(300);
    expect(formatAveragePace(10000, 3000)).toBe("5:00");
    expect(formatAveragePace(5000, 1350)).toBe("4:30");
    expect(calculateAveragePaceSecondsPerKm(3000, 1000)).toBe(333);
  });

  it("returns null when distance or duration is missing, non-positive, or out of display bounds", () => {
    expect(calculateAveragePaceSecondsPerKm(null, 1800)).toBeNull();
    expect(formatAveragePace(10000, undefined)).toBeNull();
    expect(formatAveragePace(0, 1800)).toBeNull();
    expect(formatAveragePace(10000, 0)).toBeNull();
    expect(formatAveragePace(100, 1000)).toBeNull(); // 10000 s/km > 99:59
  });
});
