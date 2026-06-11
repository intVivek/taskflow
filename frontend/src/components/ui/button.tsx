import { forwardRef, ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-accent text-accent-fg border border-accent
    hover:bg-accent-hover hover:border-accent-hover
    active:brightness-95
  `,
  secondary: `
    bg-surface text-text border border-border
    hover:bg-raised hover:border-border-strong
    active:brightness-95
  `,
  ghost: `
    bg-transparent text-text-secondary border border-transparent
    hover:bg-raised hover:text-text
    active:brightness-95
  `,
  danger: `
    bg-danger-subtle text-danger border border-danger/20
    hover:bg-danger hover:text-white hover:border-danger
    active:brightness-95
  `,
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-8 px-3 text-sm gap-2 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      loading = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center font-medium
          transition-colors duration-150 ease-in-out
          focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer select-none whitespace-nowrap
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Spinner size={12} />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
