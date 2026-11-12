import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { SILHOUETTE_SVG } from "@/lib/uploads/silhouette";

const sizes = {
  sm: "size-8",
  md: "size-10",
  lg: "size-16",
} as const;

export type AvatarSize = keyof typeof sizes;

export type AvatarProps = Omit<ComponentProps<"div">, "children"> & {
  image?: string | null;
  alt?: string;
  size?: AvatarSize;
};

// Data URI of the deterministic SVG silhouette to render an identical <img> tag
// in the DOM whether a photo is present or not, protecting privacy (#2, #130).
const SILHOUETTE_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(SILHOUETTE_SVG)}`;

// Reusable avatar component (#130). When image is null or undefined, it renders
// the deterministic silhouette. Both states produce an identical DOM structure.
export function Avatar({
  image,
  alt = "Foto de perfil",
  size = "md",
  className,
  ...props
}: AvatarProps) {
  const isDecorative = alt === "";
  const src = image || SILHOUETTE_DATA_URI;

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-overlay",
        sizes[size],
        className,
      )}
      {...props}
    >
      {/* Native <img> is used intentionally: avatars are served via authenticated
          endpoints (/api/files/...) or data URIs, bypassing Next.js static image optimization */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        aria-hidden={isDecorative ? true : undefined}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
