"use client";

import { useState } from "react";
import type { Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDueDate } from "./due-date";
import { EditTaskDialog } from "./task-dialog";
import { DeleteConfirm } from "./delete-confirm";
import { useToggleComplete } from "@/hooks/use-task-mutations";
import { useUser } from "@/hooks/use-user";
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
  const { data: me } = useUser();

  const isDone = task.status === "done";
  // Only disable this row's checkbox while THIS row's toggle is pending
  const isTogglePending =
    toggleMutation.isPending &&
    // variables is the Task passed to mutate
    (toggleMutation.variables as Task | undefined)?.id === task.id;

  // A task is "foreign" if it has an owner_email and doesn't belong to the current user
  // Treat unresolved user as foreign so controls never flash editable in scope=all
  const isForeign = Boolean(task.owner_email) && (!me || task.user_id !== me.id);

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
          group flex flex-col gap-1.5 px-3 sm:px-4 py-2.5
          border-b border-border last:border-b-0
          hover:bg-raised transition-colors duration-100
          ${onOpenPanel ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2" : ""}
        `}
      >
        {/* Row 1: checkbox + title + actions */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Toggle checkbox — expanded hit area via relative+after pseudo-element */}
          <button
            type="button"
            aria-label={
              isForeign
                ? "View only — not your task"
                : isDone
                ? "Mark incomplete"
                : "Mark complete"
            }
            aria-pressed={isForeign ? undefined : isDone}
            aria-disabled={isForeign ? true : undefined}
            title={isForeign ? "View only — not your task" : undefined}
            disabled={isTogglePending || isForeign}
            onClick={(e) => {
              e.stopPropagation();
              if (!isForeign) toggleMutation.mutate(task);
            }}
            className={`
              relative shrink-0 w-[18px] h-[18px] rounded-full
              border-2 flex items-center justify-center
              transition-all duration-150
              after:absolute after:inset-0 after:m-[-13px] after:content-['']
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isForeign ? "cursor-not-allowed" : "cursor-pointer"}
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
            title={task.title}
            className={`
              flex-1 min-w-0 text-sm truncate
              transition-all duration-150
              ${isDone ? "line-through text-text-muted" : "text-text"}
            `}
          >
            {task.title}
          </span>

          {/* Hover actions cluster — hidden for foreign tasks */}
          {!isForeign && (
            <div
              className="
                flex items-center gap-0.5 shrink-0
                sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100
                transition-opacity duration-100
              "
              onClick={(e) => e.stopPropagation()}
            >
              {/* Edit button — min 44px tap target */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Edit task"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditOpen(true);
                }}
                className="px-2.5! h-11! sm:px-1.5! sm:h-6!"
              >
                <Pencil size={12} />
              </Button>

              {/* Delete with confirmation */}
              <DeleteConfirm taskId={task.id} />
            </div>
          )}
        </div>

        {/* Row 2: badges — always visible, wraps naturally */}
        <div className="flex items-center gap-1.5 flex-wrap ml-8 sm:ml-7">
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

          {/* Owner chip — only shown in scope=all view */}
          {task.owner_email && (
            <span
              title={task.owner_email}
              className="
                text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap
                text-text-muted bg-raised border border-border
                max-w-[20ch] truncate
              "
            >
              {task.owner_email}
            </span>
          )}
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
