import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

type AlertVariant = "error" | "success" | "info";

interface AlertProps {
  variant: AlertVariant;
  children: ReactNode;
}

// items-start keeps the icon on the first line of a long message; min-w-0 and wrap-anywhere
// let a long token or link break instead of overflowing the box
const base =
  "flex min-w-0 items-start gap-2 rounded border bg-surface-elevated p-3 text-body-sm wrap-anywhere text-text-primary";

// Record obliga a tener una entrada por variante, con las dos propiedades: si falta algo, tsc falla
const variants: Record<AlertVariant, { border: string; icon: IconName }> = {
  error: { border: "border-rpe-max", icon: "warning" },
  success: { border: "border-rpe-low", icon: "check" },
  info: { border: "border-session-rodaje", icon: "info" },
};

export function Alert({ variant, children }: AlertProps) {
  const { border, icon } = variants[variant];

  return (
    <div role={variant === "error" ? "alert" : "status"} className={`${base} ${border}`}>
      <Icon name={icon} className="mt-0.5 shrink-0" />
      {children}
    </div>
  );
}
