import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { icons, type IconName } from "./icons";

export type EmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  icon?: IconName | ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: "sm" | "md";
  variant?: "card" | "plain";
  live?: boolean;
};

function isIconName(value: IconName | ReactNode): value is IconName {
  return typeof value === "string" && Object.hasOwn(icons, value);
}

const layoutBySize = {
  sm: "px-6 py-6 gap-2",
  md: "px-6 py-10 gap-4",
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  variant = "card",
  live = false,
  className,
  ...props
}: EmptyStateProps) {
  const iconNode = isIconName(icon) ? (
    <Icon name={icon} size={size === "sm" ? 20 : 28} />
  ) : (
    icon
  );

  const content = (
    <>
      {icon !== undefined && icon !== null && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full border border-border-subtle bg-surface-overlay text-text-secondary",
            size === "sm" ? "size-11" : "size-14",
          )}
        >
          {iconNode}
        </div>
      )}
      <h2 className="font-heading text-headline-sm text-text-primary">{title}</h2>
      {description && (
        <p
          className={cn(
            "max-w-lg text-pretty text-text-secondary",
            size === "sm" ? "text-body-sm" : "text-body-md",
          )}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </>
  );

  const classes = cn(
    "flex flex-col items-center text-center",
    layoutBySize[size],
    className,
  );
  const role = live ? "status" : props.role;

  if (variant === "plain") {
    return (
      <div {...props} role={role} className={classes}>
        {content}
      </div>
    );
  }

  return (
    <Card {...props} role={role} className={classes}>
      {content}
    </Card>
  );
}
