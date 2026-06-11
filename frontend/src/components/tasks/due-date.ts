export interface DueDateDisplay {
  label: string;
  tone: "danger" | "warning" | "muted";
}

/**
 * Returns a relative due-date label and tone for display.
 * Returns null when due_date is null/empty.
 */
export function formatDueDate(
  due: string | null | undefined,
  status: string,
): DueDateDisplay | null {
  if (!due) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(due + "T00:00:00");
  dueDate.setHours(0, 0, 0, 0);

  const diffMs = dueDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const isDone = status === "done";

  if (diffDays < 0) {
    // Overdue
    const daysOverdue = Math.abs(diffDays);
    const label =
      daysOverdue === 1 ? "1d overdue" : `${daysOverdue}d overdue`;
    return { label, tone: isDone ? "muted" : "danger" };
  }

  if (diffDays === 0) {
    return { label: "Today", tone: isDone ? "muted" : "warning" };
  }

  if (diffDays === 1) {
    return { label: "Tomorrow", tone: isDone ? "muted" : "warning" };
  }

  // Format as "Mon DD" e.g. "Jun 20"
  const label = dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return { label, tone: "muted" };
}
