// @vitest-environment node
import path from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const PAGE_PATH = "src/app/example/page.tsx";
// web/, found from this file so the test works wherever Vitest is launched
const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, "../../..") });

const MESSAGE =
  "Call requireAdmin() outside try/catch: redirect() and forbidden() throw, and a catch would swallow them.";

// Loading the Next plugins takes seconds: done once, outside the 5 s per-test limit
beforeAll(async () => {
  await eslint.lintText("", { filePath: PAGE_PATH });
}, 30_000);

// Lints a file with the project's own eslint.config.mjs, as npm run lint does
async function restrictedSyntaxMessages(
  code: string,
  filePath = PAGE_PATH
): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.message);
}

describe("lint rule for requireAdmin", () => {
  it("rejects requireAdmin() inside a try block", async () => {
    const page = `
      import { requireAdmin } from "@/lib/permissions/require-admin";

      export default async function Page() {
        try {
          const admin = await requireAdmin();
          return <p>{admin.nick}</p>;
        } catch {
          return <p>Error</p>;
        }
      }
    `;

    expect(await restrictedSyntaxMessages(page)).toEqual([MESSAGE]);
  });

  it("rejects requireAdmin() inside a try block in a .ts Server Action", async () => {
    const action = `
      "use server";
      import { requireAdmin } from "@/lib/permissions/require-admin";

      export async function blockAccount() {
        try {
          const admin = await requireAdmin();
          return { ok: true, by: admin.id };
        } catch {
          return { ok: false };
        }
      }
    `;

    expect(await restrictedSyntaxMessages(action, "src/app/example/actions.ts")).toEqual([MESSAGE]);
  });

  it("accepts requireAdmin() before a try block", async () => {
    const page = `
      import { requireAdmin } from "@/lib/permissions/require-admin";

      export default async function Page() {
        const admin = await requireAdmin();
        try {
          return <p>{admin.nick}</p>;
        } catch {
          return <p>Error</p>;
        }
      }
    `;

    expect(await restrictedSyntaxMessages(page)).toEqual([]);
  });

  it("accepts requireApiAdmin() inside a try block: it returns a Response, it does not throw", async () => {
    const route = `
      import { requireApiAdmin } from "@/lib/permissions/require-api-admin";

      export async function GET() {
        try {
          const result = await requireApiAdmin();
          if (result instanceof Response) return result;
          return Response.json({ nick: result.nick });
        } catch {
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    `;

    expect(await restrictedSyntaxMessages(route)).toEqual([]);
  });
});
