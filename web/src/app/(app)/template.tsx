import { requireAuth } from "@/lib/permissions/require-auth";

// Every full load of an app page goes through here (#102): a blocked or deleted
// account is sent out even from pages that show no data yet. requireAuth reads the
// account from the database, not from the JWT.
// Not enough on its own: when moving between (app) pages without a reload, Next.js
// only asks the server for the new page, and this template does not run there
// (checked in make dev). What protects the data is requireAuth or requireApiAuth in
// every page, Server Action and API route that reads or changes it (AGENTS.md)
export default async function AppTemplate({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <>{children}</>;
}
