import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectProps = ComponentProps<"select"> & {
  placeholder?: string;
  options?: ReadonlyArray<SelectOption>;
};

const base =
  'peer h-12 w-full min-w-0 appearance-none rounded border bg-surface-overlay pl-3 pr-10 text-text-primary has-[option[value=""]:checked]:text-text-muted focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50';

// DESIGN.md no define el foco con error: se propone rojo, como en Input.
const normal = "border-border-subtle focus:border-volt focus-visible:outline-volt";
const invalid = "border-rpe-max focus:border-rpe-max focus-visible:outline-rpe-max";

export function Select({ className, children, placeholder, options, ...props }: SelectProps) {
  const isInvalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";

  return (
    <div className="flex w-full items-center">
      <select className={cn(base, isInvalid ? invalid : normal, className)} {...props}>
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options
          ? options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))
          : children}
      </select>
      <Icon
        name="chevron-down"
        size={20}
        className="pointer-events-none -ml-8 shrink-0 text-text-secondary peer-disabled:opacity-50"
      />
    </div>
  );
}
