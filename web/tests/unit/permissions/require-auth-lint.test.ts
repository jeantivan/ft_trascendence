// @vitest-environment node
import path from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const PAGE_PATH = "src/app/example/page.tsx";
// web/, found from this file so the test works wherever Vitest is launched
const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, "../../..") });

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

describe("lint rule for requireAuth", () => {
  it("rejects requireAuth() inside a try block", async () => {
    const page = `
      import { requireAuth } from "@/lib/permissions/require-auth";

      export default async function Page() {
        try {
          const user = await requireAuth();
          return <p>{user.nick}</p>;
        } catch {
          return <p>Error</p>;
        }
      }
    `;

    expect(await restrictedSyntaxMessages(page)).toEqual([
      "Call requireAuth() outside try/catch: redirect() throws, and a catch would swallow it.",
    ]);
  });

  it("rejects requireAuth() inside a try block in a .ts route handler", async () => {
    const route = `
      import { requireAuth } from "@/lib/permissions/require-auth";

      export async function GET() {
        try {
          const user = await requireAuth();
          return Response.json({ nick: user.nick });
        } catch {
          return Response.json({ error: "Failed" }, { status: 500 });
        }
      }
    `;

    expect(
      await restrictedSyntaxMessages(route, "src/app/example/route.ts")
    ).toEqual([
      "Call requireAuth() outside try/catch: redirect() throws, and a catch would swallow it.",
    ]);
  });

  it("accepts requireAuth() before a try block", async () => {
    const page = `
      import { requireAuth } from "@/lib/permissions/require-auth";

      export default async function Page() {
        const user = await requireAuth();
        try {
          return <p>{user.nick}</p>;
        } catch {
          return <p>Error</p>;
        }
      }
    `;

    expect(await restrictedSyntaxMessages(page)).toEqual([]);
  });

  it("accepts requireAuth() in a try without catch: finally lets the redirect through", async () => {
    const page = `
      import { requireAuth } from "@/lib/permissions/require-auth";

      export default async function Page() {
        try {
          const user = await requireAuth();
          return <p>{user.nick}</p>;
        } finally {
          console.log("rendered");
        }
      }
    `;

    expect(await restrictedSyntaxMessages(page)).toEqual([]);
  });
});
