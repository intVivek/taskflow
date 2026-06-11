type PriorityVariant = "low" | "medium" | "high";
type StatusVariant = "todo" | "in_progress" | "done";
type BadgeVariant = PriorityVariant | StatusVariant | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  // Priority
  low: "bg-raised text-priority-low border-border",
  medium: "bg-warning-subtle text-warning border-warning/20",
  high: "bg-danger-subtle text-danger border-danger/20",

  // Status
  todo: "bg-raised text-text-muted border-border",
  in_progress: "bg-accent-subtle text-accent border-accent/20",
  done: "bg-success-subtle text-success border-success/20",

  // Neutral
  neutral: "bg-raised text-text-secondary border-border",
};

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1
        px-2 py-0.5 rounded-md
        text-xs font-medium
        border
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
