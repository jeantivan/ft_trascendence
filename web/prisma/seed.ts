// Development demo data (issue #19): 1 Admin, 1 Club with 1 Manager,
// 2 Athletes and 2 Groups. Never run in production.
// Safe to run many times: every write is an upsert ("create it if it does not
// exist; if it exists, leave it as it is").
// A database seeded before users had fixed ids fails here with a duplicate
// email: recreate it with make fclean + make dev. WARNING: make fclean
// DELETES ALL the local data stored in the project's Docker volumes
// (the database and any other volume), not only the demo data.
// Users demo password is configured via SEED_USER_PASSWORD env var.
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

async function main() {
  const seedPassword = process.env.SEED_USER_PASSWORD || "dev_password_123";
  const passwordHash = await hashPassword(seedPassword);

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
      update: { passwordHash },
      create: { ...user, passwordHash },
    });
  }

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

  const groups = [
    { id: GROUP_BEGINNERS_ID, name: "Iniciación", level: "inicial", objective: "carrera corta", athleteId: ATHLETE_1_ID },
    { id: GROUP_ADVANCED_ID, name: "Avanzado", level: "avanzado", objective: "maratón", athleteId: ATHLETE_2_ID },
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
