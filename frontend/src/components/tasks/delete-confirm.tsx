"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
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
  /** Called when the confirm strip opens or closes, so parents can suppress their own Esc handler. */
  onOpenChange?: (open: boolean) => void;
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
  onOpenChange,
}: DeleteConfirmProps) {
  const [open, setOpen] = useState(false);

  const changeOpen = useCallback(
    (value: boolean) => {
      setOpen(value);
      onOpenChange?.(value);
    },
    [onOpenChange],
  );
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef(false);
  const deleteMutation = useDeleteTask();

  // When the confirm strip opens, focus the confirm button;
  // when it closes and returnFocusRef is set, restore focus to the trigger.
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      triggerRef.current?.focus();
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
        changeOpen(false);
      }
    }
    const el = containerRef.current;
    el?.addEventListener("focusout", onFocusOut);
    return () => el?.removeEventListener("focusout", onFocusOut);
  }, [open, changeOpen]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      returnFocusRef.current = true;
      changeOpen(false);
    }
  }

  function handleConfirm() {
    deleteMutation.mutate(taskId, {
      onSuccess: () => {
        changeOpen(false);
        onDeleted?.();
      },
    });
  }

  function handleCancel() {
    returnFocusRef.current = true;
    changeOpen(false);
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
        changeOpen(true);
      }}
      className={`
        relative inline-flex items-center justify-center
        w-6 h-6 rounded-md
        text-text-muted
        border border-transparent
        hover:bg-danger-subtle hover:text-danger hover:border-danger/20
        focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
        transition-colors duration-150
        cursor-pointer
        after:absolute after:inset-0 after:m-[-11px] after:content-['']
        ${triggerClassName}
      `}
    >
      <Trash2 size={12} />
    </button>
  );
}
