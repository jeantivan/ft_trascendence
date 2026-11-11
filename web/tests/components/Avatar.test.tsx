import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/ui/Avatar";

describe("Avatar", () => {
  it("renders default silhouette Data URI when image is null", () => {
    render(<Avatar image={null} alt="Atleta sin foto" />);
    const img = screen.getByRole("img", { name: "Atleta sin foto" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
  });

  it("renders default silhouette Data URI when image is undefined with default accessible label", () => {
    render(<Avatar />);
    const img = screen.getByRole("img", { name: "Foto de perfil" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
  });

  it("hides avatar from screen readers when alt is empty string", () => {
    const { container, rerender } = render(<Avatar image={null} alt="" />);
    expect(container.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<Avatar image="/api/files/avatar-123" alt="" />);
    expect(container.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders an img element when image URL is provided", () => {
    render(<Avatar image="/api/files/avatar-123" alt="Foto de perfil" />);
    const img = screen.getByRole("img", { name: "Foto de perfil" });
    expect(img).toHaveAttribute("src", "/api/files/avatar-123");
  });

  it("supports Stitch size variants (sm=size-8, md=size-10, lg=size-16) and custom className", () => {
    const { container, rerender } = render(<Avatar image={null} size="sm" className="custom-extra" />);
    expect(container.firstChild).toHaveClass("size-8", "rounded-full", "custom-extra");

    rerender(<Avatar image={null} size="md" />);
    expect(container.firstChild).toHaveClass("size-10");

    rerender(<Avatar image={null} size="lg" />);
    expect(container.firstChild).toHaveClass("size-16");
  });
});
