import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

type AlertVariant = "error" | "success" | "info";

interface AlertProps {
  variant: AlertVariant;
  children: ReactNode;
}

const base = "flex items-center gap-2 rounded border bg-surface-elevated p-3 text-body-sm text-text-primary";

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
      <Icon name={icon} />
      {children}
    </div>
  );
}
