// Development demo data (issue #19): 1 Admin, 1 Club with 1 Manager,
// 2 Athletes and 2 Groups. Never run in production.
// Safe to run many times: every write is an upsert ("create it if it does not
// exist; if it exists, leave it as it is").
// Users have no password yet: it depends on the hashing library of issue #20.
import { prisma } from "../src/lib/prisma";
import type { GlobalRole, MembershipRole } from "../src/generated/prisma/client";

// Fixed ids, so the upserts always find the same club and groups
const CLUB_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_BEGINNERS_ID = "00000000-0000-4000-8000-000000000011";
const GROUP_ADVANCED_ID = "00000000-0000-4000-8000-000000000012";

// name = full name, nick = name shown in the app
async function upsertUser(email: string, name: string, nick: string, roleGlobal: GlobalRole) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, nick, roleGlobal },
  });
}

async function main() {
  const admin = await upsertUser("admin@demo.local", "Admin Demo", "Admin", "admin");
  const manager = await upsertUser("manager@demo.local", "Manager Demo", "Manager", "user");
  const athlete1 = await upsertUser("athlete1@demo.local", "Athlete Uno", "Uno", "user");
  const athlete2 = await upsertUser("athlete2@demo.local", "Athlete Dos", "Dos", "user");
  const users = [admin, manager, athlete1, athlete2];

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
    { userId: manager.id, role: "manager" },
    { userId: athlete1.id, role: "athlete" },
    { userId: athlete2.id, role: "athlete" },
  ];
  for (const member of members) {
    await prisma.membership.upsert({
      where: { userId_orgId: { userId: member.userId, orgId: CLUB_ID } },
      update: {},
      create: { userId: member.userId, orgId: CLUB_ID, role: member.role },
    });
  }

  const groups = [
    { id: GROUP_BEGINNERS_ID, name: "Iniciación", level: "inicial", objective: "carrera corta", athleteId: athlete1.id },
    { id: GROUP_ADVANCED_ID, name: "Avanzado", level: "avanzado", objective: "maratón", athleteId: athlete2.id },
  ];
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
  }

  console.log(
    `Seed: ${users.length} users, 1 club, ${members.length} memberships, ${groups.length} groups ready`,
  );
}

main()
  .catch((error) => {
    console.error("SEED FAILED:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
