import { describe, expect, it } from "vitest";
import { addCalendarDays, clubDateOf, clubMidnightToUtc } from "@/lib/time/club-time";

describe("clubDateOf", () => {
  it("gives the club's calendar date, not the UTC one", () => {
    // 25 Oct 2026: summer time ends in Madrid at 03:00, so that evening Madrid is UTC+1.
    // 23:30 on Sunday in UTC is already 00:30 on Monday 26 in Madrid.
    // Weekday: 1 = Monday ... 7 = Sunday (ISO 8601)
    expect(clubDateOf(new Date("2026-10-25T23:30:00Z"), "Europe/Madrid")).toEqual({
      year: 2026,
      month: 10,
      day: 26,
      weekday: 1,
    });
  });
});

describe("clubMidnightToUtc", () => {
  it("gives the UTC instant of 00:00 in the club on that day", () => {
    // Monday 26 Oct 2026, the day after summer time ends: Madrid is UTC+1,
    // so 00:00 in Madrid is 23:00 UTC on Sunday 25
    expect(clubMidnightToUtc({ year: 2026, month: 10, day: 26 }, "Europe/Madrid")).toEqual(
      new Date("2026-10-25T23:00:00Z"),
    );
  });

  it("gives the right instant on the days the clock changes in Madrid", () => {
    // Sunday 29 Mar 2026: at 02:00 the clock jumps to 03:00. Its 00:00 is still winter time (UTC+1)
    expect(clubMidnightToUtc({ year: 2026, month: 3, day: 29 }, "Europe/Madrid")).toEqual(
      new Date("2026-03-28T23:00:00Z"),
    );
    // Sunday 25 Oct 2026: at 03:00 the clock goes back to 02:00. Its 00:00 is still summer time (UTC+2)
    expect(clubMidnightToUtc({ year: 2026, month: 10, day: 25 }, "Europe/Madrid")).toEqual(
      new Date("2026-10-24T22:00:00Z"),
    );
  });

  it("uses the offset of midnight itself when the clock changes between it and 00:00 UTC", () => {
    // Sydney leaves summer time (UTC+11 to UTC+10) at 16:00 UTC on Saturday 4 Apr 2026.
    // 00:00 UTC on the 5th is already after the change (+10), but 00:00 in Sydney on
    // the 5th is before it (+11): 13:00 UTC on the 4th
    expect(clubMidnightToUtc({ year: 2026, month: 4, day: 5 }, "Australia/Sydney")).toEqual(
      new Date("2026-04-04T13:00:00Z"),
    );
  });
});

describe("addCalendarDays", () => {
  it("moves across the end of a month and of a year", () => {
    expect(addCalendarDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 1 });
    expect(addCalendarDays({ year: 2026, month: 12, day: 28 }, 7)).toEqual({ year: 2027, month: 1, day: 4 });
  });

  it("goes back with negative days, also into a 29 February", () => {
    expect(addCalendarDays({ year: 2028, month: 3, day: 1 }, -1)).toEqual({ year: 2028, month: 2, day: 29 });
  });
});

describe("invalid time zone", () => {
  it("throws instead of falling back to another zone", () => {
    // A club with organization.timezone written wrong must not go unnoticed (#145)
    expect(() => clubDateOf(new Date("2026-10-25T23:30:00Z"), "Madrid")).toThrow(RangeError);
    expect(() => clubMidnightToUtc({ year: 2026, month: 10, day: 26 }, "Madrid")).toThrow(RangeError);
  });
});
