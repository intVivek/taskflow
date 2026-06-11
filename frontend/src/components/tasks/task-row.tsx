"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDueDate } from "./due-date";
import { EditTaskDialog } from "./task-dialog";
import { DeleteConfirm } from "./delete-confirm";
import { useToggleComplete } from "@/hooks/use-task-mutations";
import { Check, Pencil } from "lucide-react";

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
  onOpenPanel?: (task: Task) => void;
}

export function TaskRow({ task, onOpenPanel }: TaskRowProps) {
  const due = formatDueDate(task.due_date, task.status);
  const [editOpen, setEditOpen] = useState(false);
  const toggleMutation = useToggleComplete();

  const isDone = task.status === "done";
  // Only disable this row's checkbox while THIS row's toggle is pending
  const isTogglePending =
    toggleMutation.isPending &&
    // variables is the Task passed to mutate
    (toggleMutation.variables as Task | undefined)?.id === task.id;

  function handleRowClick() {
    onOpenPanel?.(task);
  }

  function handleRowKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if ((e.key === "Enter" || e.key === " ") && !editOpen) {
      e.preventDefault();
      onOpenPanel?.(task);
    }
  }

  return (
    <>
      <div
        role={onOpenPanel ? "button" : undefined}
        tabIndex={onOpenPanel ? 0 : undefined}
        aria-label={onOpenPanel ? `Open task: ${task.title}` : undefined}
        onClick={handleRowClick}
        onKeyDown={onOpenPanel ? handleRowKeyDown : undefined}
        className={`
          group flex items-center gap-3 px-4 py-3
          border-b border-border last:border-b-0
          hover:bg-raised transition-colors duration-100
          min-h-[48px]
          ${onOpenPanel ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2" : ""}
        `}
      >
        {/* Toggle checkbox */}
        <button
          type="button"
          aria-label={isDone ? "Mark incomplete" : "Mark complete"}
          aria-pressed={isDone}
          disabled={isTogglePending}
          onClick={(e) => {
            e.stopPropagation();
            toggleMutation.mutate(task);
          }}
          className={`
            shrink-0 w-[18px] h-[18px] rounded-full
            border-2 flex items-center justify-center
            transition-all duration-150
            focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            cursor-pointer
            ${isDone
              ? "bg-accent border-accent"
              : "bg-transparent border-border-strong hover:border-accent group-hover:border-border-strong"
            }
          `}
        >
          {isDone && (
            <Check
              size={10}
              strokeWidth={3}
              className="text-accent-fg"
              style={{
                animation: "checkPop 150ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            />
          )}
        </button>

        {/* Title */}
        <span
          className={`
            flex-1 min-w-0 text-sm truncate
            transition-all duration-150
            ${isDone ? "line-through text-text-muted" : "text-text"}
          `}
        >
          {task.title}
        </span>

        {/* Right side: chips + hover actions */}
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

          {/* Hover actions cluster */}
          <div
            className="
              flex items-center gap-0.5
              opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
              transition-opacity duration-100
            "
          >
            {/* Edit button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Edit task"
              onClick={(e) => {
                e.stopPropagation();
                setEditOpen(true);
              }}
              className="px-1.5! h-6!"
            >
              <Pencil size={12} />
            </Button>

            {/* Delete with confirmation */}
            <DeleteConfirm taskId={task.id} />
          </div>
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
