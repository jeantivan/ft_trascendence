// The one Prisma client of the app. Use it with:
//   import { prisma } from "@/lib/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  // DATABASE_URL comes from the container environment (docker-compose.yml)
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// In development Next.js reloads modules on every change. Keeping the client on
// globalThis reuses it, instead of opening new database connections each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
