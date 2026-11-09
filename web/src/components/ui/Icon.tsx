import type { ComponentProps } from "react";
import { icons, type IconName } from "./icons";

type IconProps = Omit<ComponentProps<"svg">, "children"> & {
  name: IconName;
  size?: number;
  // Accessible name. Without it the icon is decorative and hidden from screen readers
  title?: string;
};

// The paths come from potrace on a 10240x10240 grid with the y axis pointing up,
// so the transform scales them to our 24x24 viewBox and flips them
export function Icon({ name, size = 24, title, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title && <title>{title}</title>}
      <g transform="translate(0,24) scale(0.002344,-0.002344)">
        <path d={icons[name]} />
      </g>
    </svg>
  );
}
