"use client";

import {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
} from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeleteTask } from "@/hooks/use-task-mutations";

interface DeleteConfirmProps {
  taskId: string;
  /** Called after a successful delete (e.g. to close a parent panel). */
  onDeleted?: () => void;
  /** Extra class on the trigger trash button. */
  triggerClassName?: string;
}

/**
 * Inline confirmation: trash icon → compact "Delete? [Confirm] [Cancel]" strip.
 * No window.confirm, no full modal. Esc / blur / cancel restores the trigger.
 * Keyboard accessible.
 */
export function DeleteConfirm({
  taskId,
  onDeleted,
  triggerClassName = "",
}: DeleteConfirmProps) {
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const deleteMutation = useDeleteTask();

  // When the confirm strip opens, focus the confirm button
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  // Close on blur-away (when focus leaves the container entirely)
  useEffect(() => {
    if (!open) return;
    function onFocusOut(e: FocusEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.relatedTarget as Node | null)
      ) {
        setOpen(false);
      }
    }
    const el = containerRef.current;
    el?.addEventListener("focusout", onFocusOut);
    return () => el?.removeEventListener("focusout", onFocusOut);
  }, [open]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function handleConfirm() {
    deleteMutation.mutate(taskId, {
      onSuccess: () => {
        setOpen(false);
        onDeleted?.();
      },
    });
  }

  function handleCancel() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  if (open) {
    return (
      <div
        ref={containerRef}
        role="group"
        aria-label="Confirm delete"
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1"
      >
        <span className="text-xs text-text-secondary whitespace-nowrap select-none">
          Delete?
        </span>
        <Button
          ref={confirmRef}
          type="button"
          variant="danger"
          size="sm"
          loading={deleteMutation.isPending}
          onClick={handleConfirm}
          className="px-2! h-6! text-xs!"
        >
          Confirm
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={deleteMutation.isPending}
          className="px-2! h-6! text-xs!"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-label="Delete task"
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      className={`
        inline-flex items-center justify-center
        w-6 h-6 rounded-md
        text-text-muted
        border border-transparent
        hover:bg-danger-subtle hover:text-danger hover:border-danger/20
        focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
        transition-colors duration-150
        cursor-pointer
        ${triggerClassName}
      `}
    >
      <Trash2 size={12} />
    </button>
  );
}
