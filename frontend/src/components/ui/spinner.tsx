import { forwardRef } from "react";

interface SpinnerProps {
  size?: number;
  className?: string;
}

export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(
  ({ size = 16, className = "" }, ref) => {
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className={`animate-spin ${className}`}
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke="currentColor"
          strokeWidth="2"
          strokeOpacity="0.25"
        />
        <path
          d="M14 8a6 6 0 0 0-6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
);

Spinner.displayName = "Spinner";
