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
    render(await LoginPage({}));

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/terms"
    );
  });

  it("links to /privacy and /terms on the register page", () => {
    render(<RegisterPage />);

    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/terms"
    );
  });
});
