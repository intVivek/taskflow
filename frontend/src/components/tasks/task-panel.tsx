"use client";

import {
  useEffect,
  useRef,
  useId,
  KeyboardEvent,
  MouseEvent,
  useState,
} from "react";
import { X, Check, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Task } from "@/lib/types";
import { formatDueDate } from "./due-date";
import { useToggleComplete } from "@/hooks/use-task-mutations";
import { DeleteConfirm } from "./delete-confirm";
import { EditTaskDialog } from "./task-dialog";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

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

interface TaskPanelProps {
  /** The task to display; pass null to close. */
  task: Task | null;
  onClose: () => void;
}

function formatAbsoluteDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskPanel({ task, onClose }: TaskPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toggleMutation = useToggleComplete();

  const isOpen = task !== null;

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [isOpen]);

  // Capture opener; restore focus on close
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement;
    } else {
      const opener = openerRef.current as HTMLElement | null;
      if (opener && opener.isConnected) {
        opener.focus();
      }
      openerRef.current = null;
    }
  }, [isOpen]);

  // Focus first focusable on open
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (document.activeElement && panel.contains(document.activeElement)) return;
    const el =
      panel.querySelector<HTMLElement>("[autofocus]") ??
      panel.querySelector<HTMLElement>(FOCUSABLE);
    el?.focus();
  }, [isOpen]);

  // Esc to close (but don't close if edit dialog or delete-confirm is open)
  useEffect(() => {
    if (!isOpen || editOpen || confirmOpen) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, editOpen, confirmOpen]);

  // Focus trap
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleOverlayMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  if (!task) return null;

  const due = formatDueDate(task.due_date, task.status);
  const isDone = task.status === "done";
  const isTogglePending = toggleMutation.isPending;

  return (
    <>
      {/* Overlay + panel wrapper */}
      <div
        className="fixed inset-0 z-40"
        onMouseDown={handleOverlayMouseDown}
        aria-hidden="true"
      >
        {/* Semi-transparent backdrop */}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity duration-200" />
      </div>

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="
          fixed inset-y-0 right-0 z-50
          w-full sm:max-w-md
          flex flex-col
          bg-surface border-l border-border
          shadow-2xl shadow-black/20
          translate-x-0
          animate-slide-in-right
        "
        style={{
          animation: "slideInRight 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border shrink-0">
          {/* Toggle checkbox */}
          <button
            type="button"
            aria-label={isDone ? "Mark incomplete" : "Mark complete"}
            aria-pressed={isDone}
            disabled={isTogglePending}
            onClick={() => toggleMutation.mutate(task)}
            className={`
              shrink-0 mt-0.5 w-[18px] h-[18px] rounded-full
              border-2 flex items-center justify-center
              transition-all duration-150
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
              cursor-pointer
              ${isDone
                ? "bg-accent border-accent"
                : "bg-transparent border-border-strong hover:border-accent"
              }
            `}
          >
            {isDone && (
              <Check
                size={10}
                strokeWidth={3}
                className="text-accent-fg"
                style={{ animation: "checkPop 150ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
              />
            )}
          </button>

          {/* Title */}
          <h2
            id={titleId}
            className={`
              flex-1 text-sm font-semibold leading-snug
              transition-all duration-150
              ${isDone ? "line-through text-text-muted" : "text-text"}
            `}
          >
            {task.title}
          </h2>

          {/* Close button */}
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="
              shrink-0 inline-flex items-center justify-center
              w-7 h-7 rounded-md
              text-text-muted
              hover:bg-raised hover:text-text
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
              transition-colors duration-150
              cursor-pointer
            "
          >
            <X size={14} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={task.priority as "low" | "medium" | "high"}>
              {PRIORITY_LABEL[task.priority] ?? task.priority}
            </Badge>
            <Badge variant={task.status as "todo" | "in_progress" | "done"}>
              {STATUS_LABEL[task.status] ?? task.status}
            </Badge>
            {due && (
              <span
                className={`
                  inline-flex items-center gap-1
                  text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap
                  ${TONE_CLASSES[due.tone]}
                `}
              >
                <Calendar size={10} />
                {due.label}
              </span>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              Description
            </span>
            {task.description ? (
              <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            ) : (
              <p className="text-sm text-text-muted italic">No description</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex flex-col gap-2 pt-1 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Clock size={11} className="shrink-0" />
              <span>
                <span className="font-medium">Created</span>{" "}
                {formatAbsoluteDate(task.created_at)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Clock size={11} className="shrink-0" />
              <span>
                <span className="font-medium">Updated</span>{" "}
                {formatAbsoluteDate(task.updated_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
          <DeleteConfirm
            taskId={task.id}
            onDeleted={onClose}
            triggerClassName="opacity-100"
            onOpenChange={setConfirmOpen}
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditOpen(true);
            }}
          >
            Edit
          </Button>
        </div>
      </div>

      {/* Edit dialog (rendered outside slide-over so it stacks above) */}
      <EditTaskDialog
        task={task}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />

    </>
  );
}
