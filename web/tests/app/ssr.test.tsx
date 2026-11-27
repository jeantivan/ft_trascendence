// @vitest-environment node
import { useEffect, useState, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getAccountsPageForAdmin } from "@/lib/admin/queries";
import { getTrainingPageData } from "@/lib/training/queries";

// SSR module (#49): the pages below read their data on the server before they render.
// renderToString renders a page component on the server without running anything in the
// browser (no effects), so data that a page would load from the browser is missing. It
// skips the layout, the permission checks (the queries are mocked) and the rest of the
// Next.js response: the real first response is checked by hand (README, Server-Side Rendering).
// To add a page: mock its query, render it with serverHtml and look for its data.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/admin/queries", () => ({ getAccountsPageForAdmin: vi.fn() }));
vi.mock("@/lib/training/queries", () => ({ getTrainingPageData: vi.fn() }));
vi.mock("@/lib/training/actions", () => ({
  createTrainingTemplateAction: vi.fn(),
  updateTrainingTemplateAction: vi.fn(),
  deleteTrainingTemplateAction: vi.fn(),
  assignTrainingTemplateAction: vi.fn(),
}));

import AdminAccountsPage from "@/app/(app)/admin/accounts/page";
import TrainingPage from "@/app/(app)/training/page";

// The markup of a page component rendered on the server, before any JavaScript runs in the browser
function serverHtml(page: ReactElement): string {
  return renderToString(page);
}

// Control: a page that loads its data from the browser, as a page without SSR would.
// Its data must be missing, or serverHtml would not show which pages render on the server
function BrowserLoadedPage() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    // Stands for a fetch to an API route once the page is in the browser
    void Promise.resolve("ana@demo.local").then(setEmail);
  }, []);
  return <p>{email ?? "Cargando..."}</p>;
}

describe("SSR (#49): the page is rendered on the server with its data", () => {
  it("a page that loads its data in the browser renders without it", () => {
    const html = serverHtml(<BrowserLoadedPage />);

    expect(html).toContain("Cargando...");
    expect(html).not.toContain("ana@demo.local");
  });

  it("/admin/accounts renders with its accounts", async () => {
    vi.mocked(getAccountsPageForAdmin).mockResolvedValue({
      accounts: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "ana@demo.local",
          nick: "Ana",
          roleGlobal: "user",
          blockedAt: null,
          createdAt: new Date("2026-11-14T10:00:00Z"),
        },
      ],
      hasNextPage: false,
      page: 1,
    });

    const html = serverHtml(await AdminAccountsPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("ana@demo.local");
    expect(html).toContain("Ana");
  });

  it("/training renders with the active club and its Training Templates", async () => {
    const club = { id: "22222222-2222-4222-8222-222222222222", name: "Retiro Trail" };
    vi.mocked(getTrainingPageData).mockResolvedValue({
      status: "ready",
      clubs: [club],
      activeClub: club,
      role: "athlete",
      templates: [
        {
          id: "tpl-1",
          orgId: club.id,
          name: "Base Trail",
          createdBy: "manager-1",
          sessions: [
            {
              sessionType: "cuestas",
              dayOffset: 0,
              position: 0,
              targetDistanceM: 8000,
              targetPaceSPerKm: 280,
              targetDurationS: 2240,
            },
          ],
        },
      ],
      groups: [],
      defaultStartDate: "2026-11-24",
    });

    const html = serverHtml(await TrainingPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Retiro Trail");
    expect(html).toContain("Base Trail");
  });
});
