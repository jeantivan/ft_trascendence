// Creates the initial Admin if it does not exist yet (#213). The migrate service
// runs it after the migrations, on every make and make dev, before the app starts.
// It prints where the password is, never the password (AGENTS.md).
import { ensureInitialAdmin } from "../src/lib/admin/initial-admin";
import { prisma } from "../src/lib/prisma";

async function main() {
  const { status, email } = await ensureInitialAdmin(prisma, {
    email: process.env.ADMIN_EMAIL ?? "",
    password: process.env.ADMIN_PASSWORD ?? "",
  });

  if (status === "created") {
    console.log(`Initial Admin created: ${email} (password: ADMIN_PASSWORD in .env)`);
  } else if (status === "exists") {
    console.log(`Initial Admin: ${email} already exists, left as it is`);
  } else {
    console.warn(
      `WARNING: ${email} (ADMIN_EMAIL) belongs to a normal account, so no initial Admin was created. Set another ADMIN_EMAIL in .env.`,
    );
  }
}

main()
  .catch((error: unknown) => {
    // Only the message, never a password: ours name the .env variable to fix; a
    // database error may name the database host or user, as Prisma prints them
    console.error(`Initial Admin failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
