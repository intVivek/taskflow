import { forwardRef, TextareaHTMLAttributes, useId } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id: idProp, className = "", ...props }, ref) => {
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
        <textarea
          ref={ref}
          id={id}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          className={`
            px-3 py-2 rounded-md text-sm
            bg-surface text-text
            border transition-colors duration-150
            placeholder:text-text-muted
            resize-none
            focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0
            disabled:opacity-50 disabled:cursor-not-allowed
            ${hasError
              ? "border-danger focus-visible:outline-danger"
              : "border-border hover:border-border-strong focus-visible:border-accent"
            }
            ${className}
          `}
          {...props}
        />
        {hasError && (
          <span id={errorId} className="text-xs text-danger">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
