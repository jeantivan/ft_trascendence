// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureSessionHistory } from "../../prisma/seed/session-history";
import { sessionId, type SessionHistory } from "../../prisma/seed/session-logs";

// Own users, club and session id range, so files running at the same time (and
// the demo seed's ranges, 101 and 201) never touch these rows
const ATHLETE_A_ID = "22600000-0000-4000-8000-000000000001";
const ATHLETE_B_ID = "22600000-0000-4000-8000-000000000002";
const SESSION_ID = sessionId(226001);
const DAY = new Date("2026-01-05T00:00:00.000Z");
// For the tests that are not about the health consent: nobody gets it
const NO_CONSENT = { athleteIds: [], at: DAY };

// The demo session history is created once and then left alone (#226)
describe("Integration: ensureSessionHistory", () => {
  let orgId: string;
  let history: SessionHistory;

  beforeEach(async () => {
    await prisma.user.create({ data: { id: ATHLETE_A_ID, email: "seed-session-history-a@example.test" } });
    await prisma.user.create({ data: { id: ATHLETE_B_ID, email: "seed-session-history-b@example.test" } });
    const org = await prisma.organization.create({ data: { name: "seed-session-history-club", timezone: "Europe/Madrid" } });
    orgId = org.id;
    const group = await prisma.group.create({ data: { orgId, name: "seed-session-history-group" } });
    // Written by hand, not generated: one group session and the log of Athlete A
    history = {
      sessions: [
        {
          id: SESSION_ID,
          athleteId: null,
          orgId,
          groupId: group.id,
          customizesSessionId: null,
          origin: "template",
          sessionType: "rodaje",
          targetDistanceM: 8000,
          targetPaceSPerKm: 330,
          targetDurationS: 2640,
          scheduledAt: DAY,
        },
      ],
      logs: [
        {
          sessionId: SESSION_ID,
          athleteId: ATHLETE_A_ID,
          performedAt: DAY,
          rpe: 5,
          distanceM: 8000,
          durationS: 2640,
          completed: true,
          incompletionReason: null,
        },
      ],
    };
  });

  afterEach(async () => {
    // Sessions first: the club cannot be deleted while it has sessions (Restrict).
    // Their logs go with them (Cascade), and the group goes with the club
    await prisma.trainingSession.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: { in: [ATHLETE_A_ID, ATHLETE_B_ID] } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a second run keeps a Session Log added by hand to a demo session", async () => {
    await ensureSessionHistory(prisma, { rangeIds: [SESSION_ID], history, consent: NO_CONSENT });
    const byHand = await prisma.sessionLog.create({
      data: { sessionId: SESSION_ID, athleteId: ATHLETE_B_ID, completed: true, rpe: 7, distanceM: 5000, performedAt: DAY },
    });

    const created = await ensureSessionHistory(prisma, { rangeIds: [SESSION_ID], history, consent: NO_CONSENT });

    expect(created).toBe(false);
    await expect(prisma.sessionLog.findUnique({ where: { id: byHand.id } })).resolves.toMatchObject({
      athleteId: ATHLETE_B_ID,
      rpe: 7,
      distanceM: 5000,
    });
  });

  // The history stores RPE, so the seed gives the health consent with it. Giving
  // it again later would undo a withdrawal (Privacy Policy, #226)
  it("gives the health consent when it creates the history, and never gives it back after a withdrawal", async () => {
    const consent = { athleteIds: [ATHLETE_A_ID], at: DAY };
    const consentOfA = () =>
      prisma.user.findUnique({
        where: { id: ATHLETE_A_ID },
        select: { healthConsentAt: true, healthConsentVersion: true },
      });

    await ensureSessionHistory(prisma, { rangeIds: [SESSION_ID], history, consent });
    await expect(consentOfA()).resolves.toEqual({ healthConsentAt: DAY, healthConsentVersion: 1 });

    // Athlete A withdraws it. Both fields together: CHECK users_health_consent_both_or_neither
    await prisma.user.update({
      where: { id: ATHLETE_A_ID },
      data: { healthConsentAt: null, healthConsentVersion: null },
    });
    await ensureSessionHistory(prisma, { rangeIds: [SESSION_ID], history, consent });

    await expect(consentOfA()).resolves.toEqual({ healthConsentAt: null, healthConsentVersion: null });
  });

  // Deleting a session empties Event.sessionId (SetNull), and creating the
  // session again with the same id does not bring the link back
  it("a second run keeps the link of an Event to a demo session", async () => {
    await ensureSessionHistory(prisma, { rangeIds: [SESSION_ID], history, consent: NO_CONSENT });
    // Deleted with the club in afterEach (Cascade)
    const event = await prisma.event.create({
      data: { orgId, title: "seed-session-history-event", location: "Pista", startsAt: DAY, sessionId: SESSION_ID },
    });

    await ensureSessionHistory(prisma, { rangeIds: [SESSION_ID], history, consent: NO_CONSENT });

    await expect(
      prisma.event.findUnique({ where: { id: event.id }, select: { sessionId: true } }),
    ).resolves.toEqual({ sessionId: SESSION_ID });
  });

  // One transaction: a history saved by halves would count as "already there"
  // on the next run and never be completed
  it("saves nothing, not even the health consent, when part of the history cannot be saved", async () => {
    // No user has this id: the log breaks the foreign key of session_logs
    const missingAthleteId = "22600000-0000-4000-8000-000000000099";
    const broken: SessionHistory = {
      sessions: history.sessions,
      logs: [{ ...history.logs[0], athleteId: missingAthleteId }],
    };

    await expect(
      ensureSessionHistory(prisma, {
        rangeIds: [SESSION_ID],
        history: broken,
        consent: { athleteIds: [ATHLETE_A_ID], at: DAY },
      }),
    ).rejects.toThrow();

    await expect(prisma.trainingSession.count({ where: { id: SESSION_ID } })).resolves.toBe(0);
    await expect(
      prisma.user.findUnique({ where: { id: ATHLETE_A_ID }, select: { healthConsentAt: true } }),
    ).resolves.toEqual({ healthConsentAt: null });
  });
});
