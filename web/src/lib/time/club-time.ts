// Dates in the club's time zone (organization.timezone, an IANA name such as
// "Europe/Madrid"). Weekly volume (#145) and scheduled sessions (#133) use the
// club's calendar, not UTC. Only Intl: no date library (Temporal is not in Node 24).

// A day on the calendar. month: 1-12
export type CalendarDay = {
  year: number;
  month: number;
  day: number;
};

// A calendar day in the club, with its weekday: 1 = Monday ... 7 = Sunday (ISO 8601)
export type ClubDate = CalendarDay & {
  weekday: number;
};

// Intl's short English weekday names, as ISO numbers
const WEEKDAY_NUMBERS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

// The pieces of the club's date at that instant, by type ("year", "hour"...).
// "en-US" so the weekday names match WEEKDAY_NUMBERS on any machine
function clubParts(instant: Date, timezone: string, fields: Intl.DateTimeFormatOptions): Record<string, string> {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...fields });
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return parts;
}

// The club's calendar day at that instant
export function clubDateOf(instant: Date, timezone: string): ClubDate {
  const parts = clubParts(instant, timezone, { year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_NUMBERS[parts.weekday],
  };
}

// The club's wall clock at that instant, written as if it were UTC (milliseconds).
// Minus the instant itself, it gives the zone's offset at that moment.
// hourCycle "h23": midnight is "00", not "24"
function clubWallClockAsUtc(instant: Date, timezone: string): number {
  const parts = clubParts(instant, timezone, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

// The UTC instant of 00:00 in the club on that calendar day.
// Not defined for zones where some day has no 00:00 (the clock jumps from 23:59
// to 01:00, e.g. America/Santiago): not the case of Europe/Madrid. Untested there
export function clubMidnightToUtc(date: CalendarDay, timezone: string): Date {
  // 00:00 of that day as if the club were in UTC. Date.UTC counts months from 0
  const midnightAsUtc = Date.UTC(date.year, date.month - 1, date.day);
  // First guess: minus the offset at that moment
  const firstOffset = clubWallClockAsUtc(new Date(midnightAsUtc), timezone) - midnightAsUtc;
  const firstGuess = midnightAsUtc - firstOffset;
  // Checked again at the guess: a clock change in between changes the offset
  const offset = clubWallClockAsUtc(new Date(firstGuess), timezone) - firstGuess;
  return new Date(midnightAsUtc - offset);
}
