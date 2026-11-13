import { describe, expect, it } from "vitest";
import type { AuditEntry } from "@/lib/gdpr/audit";

// Checked by tsc (npm run typecheck), not by Vitest: each @ts-expect-error fails the
// build if the line below it compiles. Vitest only runs the valid entries.
const BASE = { actorId: "actor", subjectId: "subject", resource: "account", resourceId: null } as const;

describe("AuditEntry: only role and action pairs that make sense (#183)", () => {
  it("accepts the person's own events without a role, and Manager and Admin actions with theirs", () => {
    const entries: AuditEntry[] = [
      { ...BASE, actorRole: null, action: "consent_given" },
      { ...BASE, actorRole: null, action: "consent_withdrawn" },
      { ...BASE, actorRole: null, action: "account_deleted" },
      { ...BASE, actorRole: "manager", action: "read", resource: "feedback" },
      { ...BASE, actorRole: "manager", action: "update", resource: "feedback" },
      { ...BASE, actorRole: "manager", action: "create", resource: "feedback" },
      { ...BASE, actorRole: "manager", action: "delete", resource: "membership" },
      { ...BASE, actorRole: "admin", action: "block" },
      { ...BASE, actorRole: "admin", action: "role_change" },
    ];

    expect(entries).toHaveLength(9);
  });

  it("rejects the pairs that make no sense at compile time", () => {
    const rejected: AuditEntry[] = [
      // @ts-expect-error a Manager does not give consent: only the person does
      { ...BASE, actorRole: "manager", action: "consent_given" },
      // @ts-expect-error an Admin does not withdraw someone's consent
      { ...BASE, actorRole: "admin", action: "consent_withdrawn" },
      // @ts-expect-error account_deleted is the person deleting their own account, without a role
      { ...BASE, actorRole: "admin", action: "account_deleted" },
      // @ts-expect-error reading someone's data is always by a Manager or an Admin
      { ...BASE, actorRole: null, action: "read" },
      // @ts-expect-error only the Admin blocks accounts
      { ...BASE, actorRole: "manager", action: "block" },
      // @ts-expect-error only the Admin changes roles
      { ...BASE, actorRole: "manager", action: "role_change" },
    ];

    expect(rejected).toHaveLength(6);
  });
});
