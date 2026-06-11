import { forwardRef, SelectHTMLAttributes, useId } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, id: idProp, className = "", children, ...props }, ref) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const errorId = `${id}-error`;
    const hasError = Boolean(error);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-xs font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          className={`
            h-8 px-3 rounded-md text-sm
            bg-surface text-text
            border transition-colors duration-150
            focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0
            disabled:opacity-50 disabled:cursor-not-allowed
            cursor-pointer
            ${hasError
              ? "border-danger focus-visible:outline-danger"
              : "border-border hover:border-border-strong focus-visible:border-accent"
            }
            ${className}
          `}
          {...props}
        >
          {children}
        </select>
        {hasError && (
          <span id={errorId} className="text-xs text-danger">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
