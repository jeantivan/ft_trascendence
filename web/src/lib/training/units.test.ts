import { describe, expect, it } from "vitest";
import { POSTGRES_INT_MAX } from "./schemas";
import {
  computeScheduledAtUtc,
  formatMetersToKm,
  formatSecondsPerKmToPace,
  formatSecondsToDuration,
  parseDurationToSeconds,
  parseIsoCalendarDay,
  parseKmToMeters,
  parsePaceToSecondsPerKm,
} from "./units";

describe("distance converters", () => {
  it("parses km with dot or comma up to 3 decimals into integer meters", () => {
    expect(parseKmToMeters("10")).toBe(10000);
    expect(parseKmToMeters("10.5")).toBe(10500);
    expect(parseKmToMeters("5,250")).toBe(5250);
    expect(parseKmToMeters("0.001")).toBe(1);
    expect(parseKmToMeters("1.005")).toBe(1005);
  });

  it("rejects invalid, zero, negative or >3-decimal km inputs", () => {
    expect(() => parseKmToMeters("0")).toThrow();
    expect(() => parseKmToMeters("-5")).toThrow();
    expect(() => parseKmToMeters("1.2345")).toThrow();
    expect(() => parseKmToMeters("abc")).toThrow();
  });

  it("rejects meters exceeding 32-bit signed int limit", () => {
    expect(() => parseKmToMeters("2147484")).toThrow();
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
    expect(parsePaceToSecondsPerKm("99:59")).toBe(5999);
  });

  it("rejects invalid pace formats or zero", () => {
    expect(() => parsePaceToSecondsPerKm("0:00")).toThrow();
    expect(() => parsePaceToSecondsPerKm("4:60")).toThrow();
    expect(() => parsePaceToSecondsPerKm("4.30")).toThrow();
    expect(() => parsePaceToSecondsPerKm("100:00")).toThrow();
  });

  it("formats seconds per km to m:ss and preserves round-trip symmetry", () => {
    expect(formatSecondsPerKmToPace(270)).toBe("4:30");
    expect(formatSecondsPerKmToPace(245)).toBe("4:05");
    expect(formatSecondsPerKmToPace(5999)).toBe("99:59");
    expect(parsePaceToSecondsPerKm(formatSecondsPerKmToPace(5999))).toBe(5999);
  });

  it("rejects pace over 99:59 when formatting", () => {
    expect(() => formatSecondsPerKmToPace(6000)).toThrow();
  });
});

describe("duration converters", () => {
  it("parses mm:ss, hh:mm:ss and integer minutes into seconds", () => {
    expect(parseDurationToSeconds("45")).toBe(2700);
    expect(parseDurationToSeconds("12:30")).toBe(750);
    expect(parseDurationToSeconds("01:05:10")).toBe(3910);
  });

  it("rejects invalid format, zero or overflowing duration", () => {
    expect(() => parseDurationToSeconds("0")).toThrow();
    expect(() => parseDurationToSeconds("12:60")).toThrow();
    expect(() => parseDurationToSeconds("120:00")).toThrow(); // >2 digits in mm:ss must use hh:mm:ss
  });

  it("formats seconds to mm:ss (< 1h) or hh:mm:ss (>= 1h)", () => {
    expect(formatSecondsToDuration(750)).toBe("12:30");
    expect(formatSecondsToDuration(3910)).toBe("01:05:10");
  });
});

describe("parseIsoCalendarDay and computeScheduledAtUtc", () => {
  it("parses valid dates and rejects impossible calendar dates", () => {
    expect(parseIsoCalendarDay("2026-02-28")).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    expect(() => parseIsoCalendarDay("2026-02-29")).toThrow(); // 2026 is not a leap year
    expect(() => parseIsoCalendarDay("2026-02-31")).toThrow();
    expect(() => parseIsoCalendarDay("2026-13-01")).toThrow();
    expect(() => parseIsoCalendarDay("2026-04-31")).toThrow();
  });

  it("computes 00:00 in club timezone across DST transitions", () => {
    // Europe/Madrid: 2026-03-29 switches from CET (+01:00) to CEST (+02:00) at 02:00
    const beforeDst = computeScheduledAtUtc("2026-03-28", 0, "Europe/Madrid");
    expect(beforeDst.toISOString()).toBe("2026-03-27T23:00:00.000Z");

    const afterDst = computeScheduledAtUtc("2026-03-28", 2, "Europe/Madrid");
    expect(afterDst.toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("rejects negative dayOffset or invalid date format", () => {
    expect(() =>
      computeScheduledAtUtc("2026-03-28", -1, "Europe/Madrid"),
    ).toThrow();
    expect(() =>
      computeScheduledAtUtc("28/03/2026", 0, "Europe/Madrid"),
    ).toThrow();
    expect(() =>
      computeScheduledAtUtc("2026-03-28", POSTGRES_INT_MAX + 1, "Europe/Madrid"),
    ).toThrow();
  });
});
