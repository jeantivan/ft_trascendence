import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/ui/Avatar";

describe("Avatar", () => {
  it("renders default silhouette SVG when image is null", () => {
    const { container } = render(<Avatar image={null} alt="Atleta sin foto" />);
    const silhouette = screen.getByTestId("avatar-silhouette");
    expect(silhouette).toBeInTheDocument();
    expect(silhouette).toHaveAttribute("aria-label", "Atleta sin foto");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders default silhouette SVG when image is undefined with default accessible label", () => {
    render(<Avatar />);
    const silhouette = screen.getByRole("img", { name: "Avatar" });
    expect(silhouette).toBeInTheDocument();
    expect(silhouette).toHaveAttribute("data-testid", "avatar-silhouette");
  });

  it("hides avatar from screen readers when alt is empty string", () => {
    const { rerender } = render(<Avatar image={null} alt="" />);
    expect(screen.getByTestId("avatar-silhouette")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<Avatar image="/api/files/avatar-123" alt="" />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders an img element when image URL is provided", () => {
    render(<Avatar image="/api/files/avatar-123" alt="Foto de perfil" />);
    const img = screen.getByRole("img", { name: "Foto de perfil" });
    expect(img).toHaveAttribute("src", "/api/files/avatar-123");
    expect(screen.queryByTestId("avatar-silhouette")).toBeNull();
  });

  it("supports Stitch size variants (sm=size-8, md=size-10, lg=size-24) and custom className", () => {
    const { container, rerender } = render(<Avatar image={null} size="sm" className="custom-extra" />);
    expect(container.firstChild).toHaveClass("size-8", "rounded-full", "custom-extra");

    rerender(<Avatar image={null} size="md" />);
    expect(container.firstChild).toHaveClass("size-10");

    rerender(<Avatar image={null} size="lg" />);
    expect(container.firstChild).toHaveClass("size-24");
  });
});
