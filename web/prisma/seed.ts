// Development demo data (issue #19): 1 Admin, 1 Club with 1 Manager,
// 2 Athletes and 2 Groups, plus 6 weeks of session history per Group (issue
// #23, seed/session-logs.ts). Never run in production.
// Safe to run many times: every write is an upsert ("create it if it does not
// exist; if it exists, leave it as it is") or an updateMany that only fills
// fields that are still empty, except the session history: each run deletes
// the sessions of each group's id range and creates them again, with dates
// from today. So changing seed/session-logs.ts needs no new database, but
// moving a firstSessionNumber or giving a group fewer Athletes (a shorter
// range) does: the old ids outside the new range would stay.
// A database seeded before users had fixed ids fails here with a duplicate
// email: recreate it with make fclean + make dev. WARNING: make fclean
// DELETES ALL the local data stored in the project's Docker volumes
// (the database and any other volume), not only the demo data.
// Demo users' password is configured via SEED_USER_PASSWORD env var.
import { hashPassword } from "../src/lib/auth/password";
import { prisma } from "../src/lib/prisma";
import type { GlobalRole, MembershipRole } from "../src/generated/prisma/client";
import {
  ADMIN_ID,
  ATHLETE_1_ID,
  ATHLETE_2_ID,
  CLUB_ID,
  GROUP_ADVANCED_ID,
  GROUP_BEGINNERS_ID,
  MANAGER_ID,
} from "./seed/ids";
import { seededRandom } from "./seed/random";
import { generateSessionHistory, historyStart, maxSessionCount, sessionId } from "./seed/session-logs";

async function main() {
  // firstSessionNumber: each group's session ids start there. A group uses at
  // most maxSessionCount(its Athletes) ids from it.
  const groups = [
    { id: GROUP_BEGINNERS_ID, name: "Iniciación", level: "inicial", objective: "carrera corta", athleteIds: [ATHLETE_1_ID], firstSessionNumber: 101 },
    { id: GROUP_ADVANCED_ID, name: "Avanzado", level: "avanzado", objective: "maratón", athleteIds: [ATHLETE_2_ID], firstSessionNumber: 201 },
  ];
  // The id ranges of two groups must not overlap, or deleting one group's
  // range would delete the other group's sessions. Checked before any write.
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      // Ranges [first, end): end is the first number the group never uses
      const aEnd = a.firstSessionNumber + maxSessionCount(a.athleteIds.length);
      const bEnd = b.firstSessionNumber + maxSessionCount(b.athleteIds.length);
      if (a.firstSessionNumber < bEnd && b.firstSessionNumber < aEnd) {
        throw new Error(
          `Session id ranges overlap: ${a.name} [${a.firstSessionNumber}, ${aEnd}) and ` +
            `${b.name} [${b.firstSessionNumber}, ${bEnd}). Move a firstSessionNumber.`,
        );
      }
    }
  }

  const seedPassword = process.env.SEED_USER_PASSWORD;
  if (!seedPassword) {
    throw new Error("Missing required environment variable: SEED_USER_PASSWORD");
  }
  const passwordHash = await hashPassword(seedPassword);
  // First day of the session history, also the date of the health consent.
  // The history moves with today's date on every run; the consent keeps the
  // date of the first run, which is never later, so no RPE predates it.
  const start = historyStart(new Date());

  // nick = name shown in the app
  const users: { id: string; email: string; nick: string; roleGlobal: GlobalRole }[] = [
    { id: ADMIN_ID, email: "admin@demo.local", nick: "Admin", roleGlobal: "admin" },
    { id: MANAGER_ID, email: "manager@demo.local", nick: "Manager", roleGlobal: "user" },
    { id: ATHLETE_1_ID, email: "athlete1@demo.local", nick: "Uno", roleGlobal: "user" },
    { id: ATHLETE_2_ID, email: "athlete2@demo.local", nick: "Dos", roleGlobal: "user" },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: { ...user, passwordHash },
    });
  }

  await prisma.user.updateMany({
    where: {
      id: { in: users.map((user) => user.id) },
      passwordHash: null,
    },
    data: { passwordHash },
  });

  // The history stores RPE, and RPE is only stored with health consent
  // (Privacy Policy). The Athletes give it when the history starts, so no RPE
  // is older than the consent. updateMany instead of the upsert, like the
  // password: it also fixes a database seeded before this line, and does
  // nothing once they have it. Both fields together: CHECK
  // users_health_consent_both_or_neither.
  // Demo data only: it gives consent on the user's behalf and would give it
  // back after they withdraw it. In the app, only the user gives consent.
  await prisma.user.updateMany({
    where: {
      id: { in: [ATHLETE_1_ID, ATHLETE_2_ID] },
      healthConsentAt: null,
    },
    data: { healthConsentAt: start, healthConsentVersion: 1 },
  });

  await prisma.organization.upsert({
    where: { id: CLUB_ID },
    update: {},
    create: {
      id: CLUB_ID,
      name: "Club Demo",
      description: "Club de prueba para desarrollo",
      timezone: "Europe/Madrid",
    },
  });

  const members: { userId: string; role: MembershipRole }[] = [
    { userId: MANAGER_ID, role: "manager" },
    { userId: ATHLETE_1_ID, role: "athlete" },
    { userId: ATHLETE_2_ID, role: "athlete" },
  ];
  for (const member of members) {
    await prisma.membership.upsert({
      where: { userId_orgId: { userId: member.userId, orgId: CLUB_ID } },
      update: {},
      create: { userId: member.userId, orgId: CLUB_ID, role: member.role },
    });
  }

  // Fixed seed: every run and every machine get the same history. One generator
  // for both groups, or they would get identical histories.
  const random = seededRandom(42);
  let sessionCount = 0;
  let logCount = 0;
  for (const group of groups) {
    await prisma.group.upsert({
      where: { id: group.id },
      update: {},
      create: { id: group.id, orgId: CLUB_ID, name: group.name, level: group.level, objective: group.objective },
    });
    for (const athleteId of group.athleteIds) {
      await prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: group.id, userId: athleteId } },
        update: {},
        create: { groupId: group.id, userId: athleteId },
      });
    }

    const history = generateSessionHistory({
      athleteIds: group.athleteIds,
      orgId: CLUB_ID,
      groupId: group.id,
      firstSessionNumber: group.firstSessionNumber,
      start,
      random,
    });
    // The group's whole id range, not only the ids of this run: an earlier run
    // may have used ids that this one does not
    const rangeIds: string[] = [];
    const rangeEnd = group.firstSessionNumber + maxSessionCount(group.athleteIds.length);
    for (let number = group.firstSessionNumber; number < rangeEnd; number++) {
      rangeIds.push(sessionId(number));
    }
    const logRows = [];
    for (const log of history.logs) {
      // incompletionReason is not a column: it goes in extra, with the name of
      // the export spec (docs/gdpr/export-spec.md 3.3). Completed logs have no
      // extra (undefined leaves the column null).
      const { incompletionReason, ...columns } = log;
      logRows.push({
        ...columns,
        extra: incompletionReason === null ? undefined : { incompletion_reason: incompletionReason },
      });
    }
    // All or nothing: delete the old history (its logs go with it, Cascade)
    // and create the new one. Sessions before logs: every log points to one.
    await prisma.$transaction([
      prisma.trainingSession.deleteMany({ where: { id: { in: rangeIds } } }),
      prisma.trainingSession.createMany({ data: history.sessions }),
      prisma.sessionLog.createMany({ data: logRows }),
    ]);
    sessionCount += history.sessions.length;
    logCount += history.logs.length;
  }

  // Counts only: RPE is health data and never goes to logs
  console.log(
    `Seed: ${users.length} users, 1 club, ${members.length} memberships, ${groups.length} groups, ` +
      `${sessionCount} sessions, ${logCount} session logs ready`,
  );
}

main()
  .catch((error) => {
    console.error("SEED FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
