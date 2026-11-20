"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SwitchProps = Omit<
  ComponentProps<"button">,
  "type" | "role" | "aria-checked" | "onChange"
> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  value?: string;
  label?: ReactNode;
  description?: string;
};

export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  name,
  value = "on",
  label,
  description,
  disabled = false,
  id,
  className,
  onClick,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  ...props
}: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const labelId = label ? `${switchId}-label` : undefined;
  const descriptionId = description ? `${switchId}-description` : undefined;

  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internalChecked;
  const isInvalid = Boolean(ariaInvalid && ariaInvalid !== "false");

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;

    const nextChecked = !isChecked;
    if (!isControlled) {
      setInternalChecked(nextChecked);
    }
    onCheckedChange?.(nextChecked);
  }

  const button = (
    <>
      <button
        {...props}
        id={switchId}
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-invalid={ariaInvalid}
        aria-labelledby={
          [labelId, ariaLabelledBy].filter(Boolean).join(" ") || undefined
        }
        aria-describedby={
          [descriptionId, ariaDescribedBy].filter(Boolean).join(" ") || undefined
        }
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt disabled:cursor-not-allowed disabled:opacity-50",
          isChecked
            ? "border-volt bg-volt hover:shadow-kinetic-glow"
            : "border-border-strong bg-surface-overlay hover:border-volt",
          isInvalid && "border-rpe-max",
          className
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-5 rounded-full transition-transform motion-reduce:transition-none",
            isChecked
              ? "translate-x-5 bg-surface-base"
              : "translate-x-0.5 bg-text-secondary"
          )}
        />
      </button>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value}
          disabled={disabled || !isChecked}
        />
      )}
    </>
  );

  if (!label && !description) {
    return button;
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        {label && (
          <label
            id={labelId}
            htmlFor={switchId}
            className={cn(
              "font-heading text-body-md font-semibold text-text-primary",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            )}
          >
            {label}
          </label>
        )}
        {description && (
          <p id={descriptionId} className="text-body-sm text-text-secondary">
            {description}
          </p>
        )}
      </div>
      {button}
    </div>
  );
}
