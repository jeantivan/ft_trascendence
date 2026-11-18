import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppTemplate from "@/app/(app)/template";
import { requireAuth } from "@/lib/permissions/require-auth";

vi.mock("@/lib/permissions/require-auth", () => ({ requireAuth: vi.fn() }));

// requireAuth ends by throwing a redirect when it does not let you in
class RedirectSignal extends Error {}

const SESSION_USER = { id: "user-from-session", email: "a@b.c", nick: "Uno", roleGlobal: "user" as const };

describe("(app) template", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the page once requireAuth lets the user in", async () => {
    vi.mocked(requireAuth).mockResolvedValue(SESSION_USER);

    render(await AppTemplate({ children: <p>Página de la app</p> }));

    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Página de la app")).toBeInTheDocument();
  });

  it("shows nothing to a blocked or deleted account: requireAuth's redirect goes through", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new RedirectSignal());

    await expect(AppTemplate({ children: <p>Página de la app</p> })).rejects.toBeInstanceOf(RedirectSignal);
  });
});
