// Weekly volume of an Athlete in a club and the Volume Alert (#145, CONTEXT.md).
// Pure calculation: it checks no permissions and no membership, the caller does (#143).
// Reads distances only, never RPE.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { clubDateOf, clubMidnightToUtc } from "@/lib/time/club-time";

export type VolumeTrend = {
  currentWeekMeters: number;
  previousWeekMeters: number;
  // Not rounded, negative when the volume goes down. null when the week before has 0 m
  deltaPercent: number | null;
  volumeAlertTriggered: boolean;
};

// Mondays at 00:00 in the club, as UTC instants: the week before starts at
// previousStart, the week of the instant goes from currentStart to nextStart (not included)
type ClubWeeks = {
  previousStart: Date;
  currentStart: Date;
  nextStart: Date;
};

function clubWeekBounds(instant: Date, timezone: string): ClubWeeks {
  const today = clubDateOf(instant, timezone);
  // Days are counted on the calendar, not in hours: a week with a clock change
  // lasts 167 or 169 hours. Date.UTC moves day 0 or day 32 to the right month
  const mondayAt = (daysFromToday: number) => {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + daysFromToday));
    return clubMidnightToUtc(
      { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() },
      timezone,
    );
  };
  const toMonday = 1 - today.weekday;
  return {
    previousStart: mondayAt(toMonday - 7),
    currentStart: mondayAt(toMonday),
    nextStart: mondayAt(toMonday + 7),
  };
}

// The alert is decided on integers: current > previous * 1.1 is current * 10 > previous * 11,
// so a rise of exactly 10 % never raises it because of floating point
function trendFromWeeks(currentWeekMeters: number, previousWeekMeters: number): VolumeTrend {
  if (previousWeekMeters === 0) {
    return { currentWeekMeters, previousWeekMeters, deltaPercent: null, volumeAlertTriggered: false };
  }
  return {
    currentWeekMeters,
    previousWeekMeters,
    deltaPercent: ((currentWeekMeters - previousWeekMeters) / previousWeekMeters) * 100,
    volumeAlertTriggered: currentWeekMeters * 10 > previousWeekMeters * 11,
  };
}

// db: prisma, or the tx of the caller's transaction
export async function calculateVolumeTrend(
  athleteId: string,
  date: Date,
  orgId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<VolumeTrend> {
  const organization = await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
  // The caller decides what a failure means (#143): nothing is swallowed here.
  // The message carries the club id only, never data about the Athlete
  if (!organization) {
    throw new Error(`Organization ${orgId} not found`);
  }
  let weeks: ClubWeeks;
  try {
    weeks = clubWeekBounds(date, organization.timezone);
  } catch (error) {
    // Intl's RangeError names the zone but not the club: #143 needs to know which one
    if (error instanceof RangeError) {
      throw new Error(`Organization ${orgId} has an invalid timezone`, { cause: error });
    }
    throw error;
  }

  const metersBetween = async (from: Date, to: Date) => {
    const result = await db.sessionLog.aggregate({
      _sum: { distanceM: true },
      // A log has no club of its own: it is the club of its session.
      // Only completed sessions with a distance count (Weekly Volume, CONTEXT.md).
      // gt 0 also keeps out negative distances: distance_m has no CHECK
      where: {
        athleteId,
        completed: true,
        distanceM: { gt: 0 },
        session: { orgId },
        performedAt: { gte: from, lt: to },
      },
    });
    // SUM of no rows is NULL
    return result._sum.distanceM ?? 0;
  };

  return trendFromWeeks(
    await metersBetween(weeks.currentStart, weeks.nextStart),
    await metersBetween(weeks.previousStart, weeks.currentStart),
  );
}
