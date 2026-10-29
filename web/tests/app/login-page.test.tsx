import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

vi.mock("@/lib/auth/actions", () => ({
  loginAction: vi.fn(),
}));

describe("LoginPage", () => {
  it("shows the blocked account notice for /login?error=blocked", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "blocked" }) }));

    expect(screen.getByText(/Tu cuenta está bloqueada/)).toBeInTheDocument();
  });
});
