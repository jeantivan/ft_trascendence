import { cloneElement, type ComponentProps, type ReactElement } from "react";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  // One control (Input...); FormField adds the aria attributes that tie it to the error
  children: ReactElement<ComponentProps<"input">>;
}

export function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  const errorId = `${htmlFor}-error`;
  const control = error
    ? cloneElement(children, { "aria-invalid": true, "aria-describedby": errorId })
    : children;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-body-sm font-medium text-text-primary">{label}</label>
      {control}
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-rpe-max">
          {error}
        </p>
      )}
    </div>
  );
}
