import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";

vi.mock("@/lib/auth/actions", () => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
}));

describe("LoginPage & RegisterPage", () => {
  it("shows the blocked account notice for /login?error=blocked", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "blocked" }) }));

    expect(screen.getByText(/Tu cuenta está bloqueada/)).toBeInTheDocument();
  });

  it("links to /privacy and /terms on the login page", async () => {
    const { container } = render(await LoginPage({}));

    expect(container.querySelector('footer a[href="/privacy"]')).toBeInTheDocument();
    expect(container.querySelector('footer a[href="/terms"]')).toBeInTheDocument();
  });

  it("links to /privacy and /terms on the register page", () => {
    const { container } = render(<RegisterPage />);

    expect(container.querySelector('footer a[href="/privacy"]')).toBeInTheDocument();
    expect(container.querySelector('footer a[href="/terms"]')).toBeInTheDocument();
  });
});
