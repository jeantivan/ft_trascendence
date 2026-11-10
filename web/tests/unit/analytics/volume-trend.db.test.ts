// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { calculateVolumeTrend } from "@/lib/analytics/volume-trend";
import { seededRandom } from "../../../prisma/seed/random";
import { generateSessionHistory } from "../../../prisma/seed/session-logs";

// These tests create and delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const ATHLETE_ID = "14500000-0000-4000-8000-000000000001";
const OTHER_ATHLETE_ID = "14500000-0000-4000-8000-000000000002";

// Weekly volume of an Athlete in a club and the Volume Alert (#145, CONTEXT.md)
describe("calculateVolumeTrend", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  let orgId: string;
  // Clubs created by a test besides orgId, removed in afterEach
  let otherOrgIds: string[] = [];

  async function createOtherClub(timezone = "Europe/Madrid"): Promise<string> {
    const org = await db.organization.create({ data: { name: "volume-trend-other-club", timezone } });
    otherOrgIds.push(org.id);
    return org.id;
  }

  // One log on its own session (a log is unique per session and Athlete).
  // By default completed, of ATHLETE_ID and in the test's club
  async function logRun(
    performedAt: string,
    distanceM: number | null,
    options: { inOrgId?: string; completed?: boolean; athleteId?: string } = {},
  ) {
    const athleteId = options.athleteId ?? ATHLETE_ID;
    const session = await db.trainingSession.create({
      data: {
        orgId: options.inOrgId ?? orgId,
        origin: "free",
        sessionType: "rodaje",
        scheduledAt: new Date(performedAt),
        athleteId,
      },
    });
    await db.sessionLog.create({
      data: {
        sessionId: session.id,
        athleteId,
        completed: options.completed ?? true,
        rpe: 5,
        distanceM,
        performedAt: new Date(performedAt),
      },
    });
  }

  beforeEach(async () => {
    await db.user.create({ data: { id: ATHLETE_ID, email: "volume-trend@example.test" } });
    await db.user.create({ data: { id: OTHER_ATHLETE_ID, email: "volume-trend-other@example.test" } });
    const org = await db.organization.create({ data: { name: "volume-trend-club", timezone: "Europe/Madrid" } });
    orgId = org.id;
  });

  afterEach(async () => {
    // Sessions first: the club cannot be deleted while it has sessions (Restrict).
    // Their logs go with them (Cascade)
    const allOrgIds = [orgId, ...otherOrgIds];
    await db.trainingSession.deleteMany({ where: { orgId: { in: allOrgIds } } });
    await db.organization.deleteMany({ where: { id: { in: allOrgIds } } });
    otherOrgIds = [];
    await db.user.deleteMany({ where: { id: { in: [ATHLETE_ID, OTHER_ATHLETE_ID] } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("compares the week of the date with the one before and raises the alert above 10 %", async () => {
    // Wednesdays 14 and 21 Oct 2026, noon in Madrid (UTC+2)
    await logRun("2026-10-14T10:00:00Z", 1000);
    await logRun("2026-10-21T10:00:00Z", 1101);

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, db);

    expect(trend).toStrictEqual({
      currentWeekMeters: 1101,
      previousWeekMeters: 1000,
      // (1101 - 1000) / 1000 * 100 in floating point is 10.100000000000001
      deltaPercent: expect.closeTo(10.1, 10),
      volumeAlertTriggered: true,
    });
  });

  it("counts only the sessions of that club", async () => {
    const otherClub = await createOtherClub();
    await logRun("2026-10-21T10:00:00Z", 1101);
    await logRun("2026-10-21T18:00:00Z", 5000, { inOrgId: otherClub });

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, db);

    expect(trend.currentWeekMeters).toBe(1101);
  });

  it("does not raise the alert for a rise of exactly 10 %", async () => {
    await logRun("2026-10-14T10:00:00Z", 1000);
    await logRun("2026-10-21T10:00:00Z", 1100);

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, db);

    expect(trend).toStrictEqual({
      currentWeekMeters: 1100,
      previousWeekMeters: 1000,
      deltaPercent: 10,
      volumeAlertTriggered: false,
    });
  });

  it("gives no alert and no percentage when the week before has 0 m", async () => {
    await logRun("2026-10-21T10:00:00Z", 5000);

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, db);

    expect(trend).toStrictEqual({
      currentWeekMeters: 5000,
      previousWeekMeters: 0,
      deltaPercent: null,
      volumeAlertTriggered: false,
    });
  });

  it("splits the weeks at Monday 00:00 in the club, also across a clock change", async () => {
    // Summer time ends on Sunday 25 Oct 2026: the week before (19 to 26 Oct) lasts 169 h.
    // Monday 26 at 00:00 in Madrid (UTC+1) is 23:00 UTC on the 25th
    await logRun("2026-10-25T23:00:00.000Z", 1000); // Monday 26, 00:00: this week
    await logRun("2026-10-25T22:59:59.999Z", 200); // Sunday 25, 23:59:59.999: the week before
    // Monday 19 at 00:00 in Madrid (still UTC+2) is 22:00 UTC on the 18th
    await logRun("2026-10-18T22:00:00.000Z", 30); // Monday 19, 00:00: the week before
    await logRun("2026-10-18T21:59:59.999Z", 4); // Sunday 18: two weeks before, not counted

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-28T10:00:00Z"), orgId, db);

    expect(trend.currentWeekMeters).toBe(1000);
    expect(trend.previousWeekMeters).toBe(230);
  });

  it("counts only the logs of that Athlete", async () => {
    await logRun("2026-10-21T10:00:00Z", 1101);
    await logRun("2026-10-21T18:00:00Z", 5000, { athleteId: OTHER_ATHLETE_ID });

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, db);

    expect(trend.currentWeekMeters).toBe(1101);
  });

  // distance_m has no CHECK and its validation on write (#141/#142) is not there yet
  it("does not let a negative distance subtract volume", async () => {
    await logRun("2026-10-21T10:00:00Z", 1101);
    await logRun("2026-10-21T18:00:00Z", -500);

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, db);

    expect(trend.currentWeekMeters).toBe(1101);
  });

  it("does not count sessions that were not completed, even with a distance", async () => {
    await logRun("2026-10-21T10:00:00Z", 1101);
    await logRun("2026-10-21T18:00:00Z", 3000, { completed: false });

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, db);

    expect(trend.currentWeekMeters).toBe(1101);
  });

  it("ignores completed logs without a distance", async () => {
    await logRun("2026-10-21T10:00:00Z", 1101);
    await logRun("2026-10-21T18:00:00Z", null);

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, db);

    expect(trend.currentWeekMeters).toBe(1101);
  });

  it("sees the caller's uncommitted logs when it gets the caller's tx", async () => {
    // #143 may call it inside its own transaction, right after saving the log
    const trend = await db.$transaction(async (tx) => {
      const session = await tx.trainingSession.create({
        data: { orgId, origin: "free", sessionType: "rodaje", scheduledAt: new Date("2026-10-21T10:00:00Z"), athleteId: ATHLETE_ID },
      });
      await tx.sessionLog.create({
        data: {
          sessionId: session.id,
          athleteId: ATHLETE_ID,
          completed: true,
          rpe: 5,
          distanceM: 1101,
          performedAt: new Date("2026-10-21T10:00:00Z"),
        },
      });
      return calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), orgId, tx);
    });

    expect(trend.currentWeekMeters).toBe(1101);
  });

  it("matches the weekly sums of the seed's 6-week history (#23)", async () => {
    // Week 4 of a history that starts on Monday 7 Sep 2026. Monday 00:00 in Madrid
    // (UTC+2 in September), written by hand so the expected sums do not come from club-time
    const previousStart = new Date("2026-09-20T22:00:00Z"); // Monday 21 Sep
    const currentStart = new Date("2026-09-27T22:00:00Z"); // Monday 28 Sep
    const nextStart = new Date("2026-10-04T22:00:00Z"); // Monday 5 Oct

    const group = await db.group.create({ data: { orgId, name: "volume-trend-group" } });
    const history = generateSessionHistory({
      athleteIds: [ATHLETE_ID],
      orgId,
      groupId: group.id,
      start: new Date("2026-09-07T00:00:00Z"),
      random: seededRandom(145),
      firstSessionNumber: 14501,
    });
    await db.trainingSession.createMany({ data: history.sessions });
    // As seed.ts does: incompletionReason is not a column, it goes in extra
    await db.sessionLog.createMany({
      data: history.logs.map(({ incompletionReason, ...columns }) => ({
        ...columns,
        extra: incompletionReason === null ? undefined : { incompletion_reason: incompletionReason },
      })),
    });

    // The same rule written another way: completed logs of the Athlete between two Mondays
    const metersBetween = (from: Date, to: Date) =>
      history.logs
        .filter((log) => log.athleteId === ATHLETE_ID && log.completed && log.performedAt >= from && log.performedAt < to)
        .reduce((sum, log) => sum + log.distanceM, 0);
    const expectedCurrent = metersBetween(currentStart, nextStart);
    const expectedPrevious = metersBetween(previousStart, currentStart);
    // Otherwise 0 = 0 would prove nothing
    expect(expectedCurrent).toBeGreaterThan(0);
    expect(expectedPrevious).toBeGreaterThan(0);

    const trend = await calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-01T10:00:00Z"), orgId, db);

    expect(trend.currentWeekMeters).toBe(expectedCurrent);
    expect(trend.previousWeekMeters).toBe(expectedPrevious);
  });

  it("throws a clear error, with the club id only, when the club's time zone is invalid", async () => {
    const badClub = await createOtherClub("Madrid");

    await expect(calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), badClub, db)).rejects.toThrow(
      `Organization ${badClub} has an invalid timezone`,
    );
  });

  it("throws a clear error, with the club id only, when the club does not exist", async () => {
    const missingOrgId = "14500000-0000-4000-8000-0000000000ff";

    await expect(calculateVolumeTrend(ATHLETE_ID, new Date("2026-10-22T10:00:00Z"), missingOrgId, db)).rejects.toThrow(
      `Organization ${missingOrgId} not found`,
    );
  });
});
