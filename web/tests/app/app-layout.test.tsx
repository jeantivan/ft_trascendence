import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppLayout from "@/app/(app)/layout";
import { getCurrentUser } from "@/lib/permissions/current-user";

vi.mock("@/lib/permissions/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

const user = (roleGlobal: "admin" | "user") => ({
  ok: true as const,
  user: { id: "u1", email: "a@demo.local", nick: "A", roleGlobal },
});

describe("(app) layout", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
  });

  it("the Admin sees the link to the panel (#102)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user("admin"));

    render(await AppLayout({ children: <p>contenido</p> }));

    expect(screen.getByRole("link", { name: "Administración" })).toHaveAttribute("href", "/admin/accounts");
  });

  it("anyone else does not", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user("user"));

    render(await AppLayout({ children: <p>contenido</p> }));

    expect(screen.queryByRole("link", { name: "Administración" })).not.toBeInTheDocument();
  });
});
