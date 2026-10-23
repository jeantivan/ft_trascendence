// Prisma CLI configuration (Prisma 7).
// DATABASE_URL comes from the container environment (docker-compose.yml),
// so no .env loader is needed here.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Demo data for development (npx prisma db seed)
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
