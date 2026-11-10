import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { SILHOUETTE_SVG } from "@/lib/uploads/silhouette";

const sizes = {
  sm: "size-8",
  md: "size-10",
  lg: "size-24",
} as const;

export type AvatarSize = keyof typeof sizes;

export type AvatarProps = Omit<ComponentProps<"div">, "children"> & {
  image?: string | null;
  alt?: string;
  size?: AvatarSize;
};

// Reusable avatar component (#130). When image is null or undefined, it renders
// the deterministic silhouette from silhouette.ts to protect privacy (#2).
export function Avatar({ image, alt = "Avatar", size = "md", className, ...props }: AvatarProps) {
  const isDecorative = alt === "";

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-overlay",
        sizes[size],
        className,
      )}
      {...props}
    >
      {image ? (
        <img
          src={image}
          alt={alt}
          aria-hidden={isDecorative ? true : undefined}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="block h-full w-full [&>svg]:h-full [&>svg]:w-full"
          role={isDecorative ? undefined : "img"}
          aria-label={isDecorative ? undefined : alt}
          aria-hidden={isDecorative ? true : undefined}
          data-testid="avatar-silhouette"
          dangerouslySetInnerHTML={{ __html: SILHOUETTE_SVG }}
        />
      )}
    </div>
  );
}
