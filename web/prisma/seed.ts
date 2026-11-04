// Development demo data (issue #19): 1 Admin, 1 Club with 1 Manager,
// 2 Athletes and 2 Groups, plus 6 weeks of session history per Group (issue
// #23, seed/session-logs.ts). Never run in production.
// Safe to run many times: every write is an upsert ("create it if it does not
// exist; if it exists, leave it as it is") or an updateMany that only fills
// fields that are still empty.
// So after changing seed/session-logs.ts, recreate the database: the upserts
// would keep the old history and mix it with the new one.
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
import { generateSessionHistory, historyStart } from "./seed/session-logs";

async function main() {
  const seedPassword = process.env.SEED_USER_PASSWORD;
  if (!seedPassword) {
    throw new Error("Missing required environment variable: SEED_USER_PASSWORD");
  }
  const passwordHash = await hashPassword(seedPassword);
  // First day of the session history, also the date of the health consent.
  // Rows keep the dates of the first seed: later runs do not overwrite them.
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

  // firstSessionNumber: each group's session ids start there. The ranges must
  // not overlap, or the upserts would silently skip the other group's sessions.
  // With one Athlete a group uses at most 72 ids (up to 24 group sessions,
  // 24 adapted copies, 12 Free and 12 direct Customized Sessions).
  const groups = [
    { id: GROUP_BEGINNERS_ID, name: "Iniciación", level: "inicial", objective: "carrera corta", athleteId: ATHLETE_1_ID, firstSessionNumber: 101 },
    { id: GROUP_ADVANCED_ID, name: "Avanzado", level: "avanzado", objective: "maratón", athleteId: ATHLETE_2_ID, firstSessionNumber: 201 },
  ];
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
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: group.athleteId } },
      update: {},
      create: { groupId: group.id, userId: group.athleteId },
    });

    const history = generateSessionHistory({
      athleteIds: [group.athleteId],
      orgId: CLUB_ID,
      groupId: group.id,
      firstSessionNumber: group.firstSessionNumber,
      start,
      random,
    });
    // Sessions first: every log points to one of them
    for (const session of history.sessions) {
      await prisma.trainingSession.upsert({
        where: { id: session.id },
        update: {},
        create: { ...session },
      });
    }
    for (const log of history.logs) {
      // incompletionReason is not a column: it goes in extra, with the name of
      // the export spec (docs/gdpr/export-spec.md 3.3). Completed logs have no
      // extra (undefined leaves the column null).
      const { incompletionReason, ...columns } = log;
      await prisma.sessionLog.upsert({
        where: { sessionId_athleteId: { sessionId: log.sessionId, athleteId: log.athleteId } },
        update: {},
        create: {
          ...columns,
          extra: incompletionReason === null ? undefined : { incompletion_reason: incompletionReason },
        },
      });
    }
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
