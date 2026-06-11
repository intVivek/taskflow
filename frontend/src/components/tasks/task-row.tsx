"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDueDate } from "./due-date";
import { EditTaskDialog } from "./task-dialog";
import { Pencil } from "lucide-react";

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

const TONE_CLASSES: Record<string, string> = {
  danger: "text-danger bg-danger-subtle border border-danger/20",
  warning: "text-warning bg-warning-subtle border border-warning/20",
  muted: "text-text-muted bg-raised border border-border",
};

interface TaskRowProps {
  task: Task;
}

export function TaskRow({ task }: TaskRowProps) {
  const due = formatDueDate(task.due_date, task.status);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div
        className="
          group flex items-center gap-3 px-4 py-3
          border-b border-border last:border-b-0
          hover:bg-raised transition-colors duration-100
          min-h-[48px]
        "
      >
        {/* Checkbox placeholder circle */}
        <button
          type="button"
          disabled
          aria-label="Toggle complete (coming soon)"
          className="
            shrink-0 w-[18px] h-[18px] rounded-full
            border-2 border-border-strong
            bg-transparent
            disabled:cursor-not-allowed
            transition-colors duration-150
            group-hover:border-border-strong
          "
        />

        {/* Title */}
        <span
          className={`
            flex-1 min-w-0 text-sm truncate
            ${task.status === "done" ? "line-through text-text-muted" : "text-text"}
          `}
        >
          {task.title}
        </span>

        {/* Right side: chips + edit action */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Due date chip */}
          {due && (
            <span
              className={`
                text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap
                ${TONE_CLASSES[due.tone]}
              `}
            >
              {due.label}
            </span>
          )}

          {/* Priority badge */}
          <Badge variant={task.priority as "low" | "medium" | "high"}>
            {PRIORITY_LABEL[task.priority] ?? task.priority}
          </Badge>

          {/* Status badge */}
          <Badge variant={task.status as "todo" | "in_progress" | "done"}>
            {STATUS_LABEL[task.status] ?? task.status}
          </Badge>

          {/* Edit button — visible on hover / focus-within */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Edit task"
            onClick={() => setEditOpen(true)}
            className="
              opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
              transition-opacity duration-100
              px-1.5! h-6!
            "
          >
            <Pencil size={12} />
          </Button>
        </div>
      </div>

      <EditTaskDialog
        task={task}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
