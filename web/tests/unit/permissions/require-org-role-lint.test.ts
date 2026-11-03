// @vitest-environment node
import path from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const PAGE_PATH = "src/app/example/page.tsx";
// web/, found from this file so the test works wherever Vitest is launched
const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, "../../..") });

const MESSAGE =
  "Call requireOrgRole() and requireOrgResource() outside try/catch: redirect(), notFound() and forbidden() throw, and a catch would swallow them.";

// Loading the Next plugins takes seconds: done once, outside the 5 s per-test limit
beforeAll(async () => {
  await eslint.lintText("", { filePath: PAGE_PATH });
}, 30_000);

// Lints a file with the project's own eslint.config.mjs, as npm run lint does
async function restrictedSyntaxMessages(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: PAGE_PATH });
  return result.messages
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.message);
}

describe("lint rule for requireOrgRole and requireOrgResource", () => {
  it("rejects requireOrgRole() inside a try block", async () => {
    const page = `
      import { requireOrgRole } from "@/lib/permissions/require-org-role";
      import { ORG_ROLES } from "@/lib/permissions/org-roles";

      export default async function Page({ clubId }: { clubId: string }) {
        try {
          const { user } = await requireOrgRole(clubId, ORG_ROLES["group.write"]);
          return <p>{user.nick}</p>;
        } catch {
          return <p>Error</p>;
        }
      }
    `;

    expect(await restrictedSyntaxMessages(page)).toEqual([MESSAGE]);
  });

  it("rejects requireOrgResource() inside a try block", async () => {
    const page = `
      import { requireOrgResource } from "@/lib/permissions/require-org-resource";
      import { ORG_ROLES } from "@/lib/permissions/org-roles";

      export default async function Page({ group }: { group: { orgId: string } | null }) {
        try {
          const { user } = await requireOrgResource(group, ORG_ROLES["group.read"]);
          return <p>{user.nick}</p>;
        } catch {
          return <p>Error</p>;
        }
      }
    `;

    expect(await restrictedSyntaxMessages(page)).toEqual([MESSAGE]);
  });

  it("accepts requireOrgRole() before a try block", async () => {
    const page = `
      import { requireOrgRole } from "@/lib/permissions/require-org-role";
      import { ORG_ROLES } from "@/lib/permissions/org-roles";

      export default async function Page({ clubId }: { clubId: string }) {
        const { user } = await requireOrgRole(clubId, ORG_ROLES["group.write"]);
        try {
          return <p>{user.nick}</p>;
        } catch {
          return <p>Error</p>;
        }
      }
    `;

    expect(await restrictedSyntaxMessages(page)).toEqual([]);
  });

  it("accepts the API versions inside a try block: they return a Response, they do not throw", async () => {
    const route = `
      import { requireApiOrgRole } from "@/lib/permissions/require-api-org-role";
      import { ORG_ROLES } from "@/lib/permissions/org-roles";

      export async function GET() {
        try {
          const result = await requireApiOrgRole("id", ORG_ROLES["event.read"]);
          if (result instanceof Response) return result;
          return Response.json({ nick: result.user.nick });
        } catch {
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    `;

    expect(await restrictedSyntaxMessages(route)).toEqual([]);
  });
});
