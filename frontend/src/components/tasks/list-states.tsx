"use client";

import { ClipboardList, SearchX, AlertTriangle, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTaskParams } from "@/hooks/use-task-params";

// ─── Skeleton rows ────────────────────────────────────────────────────────────

interface SkeletonRowsProps {
  n?: number;
}

export function SkeletonRows({ n = 6 }: SkeletonRowsProps) {
  return (
    <div data-testid="task-skeleton">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 min-h-[48px]"
        >
          {/* Circle placeholder */}
          <Skeleton className="shrink-0 w-[18px] h-[18px] rounded-full" />
          {/* Title */}
          <Skeleton
            className={`h-4 rounded-md flex-1 min-w-0 ${i % 3 === 0 ? "max-w-[60%]" : i % 3 === 1 ? "max-w-[80%]" : "max-w-[45%]"}`}
          />
          {/* Chips */}
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-5 w-14 rounded-md" />
            <Skeleton className="h-5 w-12 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty: no tasks at all ───────────────────────────────────────────────────

interface EmptyNoTasksProps {
  onNewTask?: () => void;
}

export function EmptyNoTasks({ onNewTask }: EmptyNoTasksProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="mb-4 p-4 rounded-2xl bg-accent-subtle">
        <ClipboardList size={32} className="text-accent" />
      </div>
      <h3 className="text-base font-semibold text-text mb-1">
        No tasks yet
      </h3>
      <p className="text-sm text-text-muted max-w-xs mb-4">
        Create your first task to get started. Tasks you add will appear here.
      </p>
      {onNewTask && (
        <Button variant="primary" size="sm" onClick={onNewTask}>
          <Plus size={14} />
          New task
        </Button>
      )}
    </div>
  );
}

// ─── Empty: no matches for current filters ───────────────────────────────────

export function EmptyNoMatches() {
  const { set } = useTaskParams();

  function clearFilters() {
    set({ status: "", q: "", sort: "created_at", order: "desc", page: 1 });
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="mb-4 p-4 rounded-2xl bg-raised">
        <SearchX size={32} className="text-text-muted" />
      </div>
      <h3 className="text-base font-semibold text-text mb-1">
        No matching tasks
      </h3>
      <p className="text-sm text-text-muted max-w-xs mb-4">
        No tasks match your current filters. Try adjusting the search or status.
      </p>
      <Button variant="secondary" size="sm" onClick={clearFilters}>
        Clear filters
      </Button>
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="mb-4 p-4 rounded-2xl bg-danger-subtle">
        <AlertTriangle size={32} className="text-danger" />
      </div>
      <h3 className="text-base font-semibold text-text mb-1">
        Something went wrong
      </h3>
      <p className="text-sm text-text-muted max-w-xs mb-4">
        {message ?? "Failed to load tasks. Please try again."}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
