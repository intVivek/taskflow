"use client";

import { useState } from "react";
import { useTaskParams } from "@/hooks/use-task-params";
import { useTasks } from "@/hooks/use-tasks";
import { ListControls } from "./list-controls";
import { TaskRow } from "./task-row";
import { TaskPanel } from "./task-panel";
import { Pagination } from "./pagination";
import {
  SkeletonRows,
  EmptyNoTasks,
  EmptyNoMatches,
  ErrorState,
} from "./list-states";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CreateTaskDialog } from "./task-dialog";
import type { Task } from "@/lib/types";

export function TaskList() {
  const params = useTaskParams();
  const { status, q, sort, order, page, scope } = params;
  const { data, isLoading, isError, error, refetch, isFetching } = useTasks({
    status,
    q,
    sort,
    order,
    page,
    scope,
  });
  const [createOpen, setCreateOpen] = useState(false);
  // Snapshot of the task the panel was opened with
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const tasks = data?.data ?? [];
  const meta = data?.meta;

  // Derive fresh task data from the current query result; fall back to snapshot
  // so the panel still shows content while a delete-triggered refetch settles.
  const panelTask = openTask
    ? (tasks.find((t) => t.id === openTask.id) ?? openTask)
    : null;

  return (
    <div className="space-y-4">
      {/* Page title row */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-semibold text-text tracking-tight">
            Tasks
          </h1>
          {meta && (
            <span className="text-xs font-medium text-text-muted bg-raised border border-border rounded-full px-2 py-0.5">
              {meta.total}
            </span>
          )}
          {/* Subtle fetching indicator */}
          {isFetching && !isLoading && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          New task
        </Button>
      </div>

      {/* Controls */}
      <ListControls />

      {/* Content area */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <SkeletonRows n={8} />
        ) : isError ? (
          <ErrorState message={error?.message} onRetry={() => refetch()} />
        ) : tasks.length === 0 ? (
          params.hasActiveFilters ? (
            <EmptyNoMatches />
          ) : (
            <EmptyNoTasks onNewTask={() => setCreateOpen(true)} />
          )
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onOpenPanel={setOpenTask}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && !isLoading && !isError && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <Pagination meta={meta} />
        </div>
      )}

      {/* Create dialog */}
      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Task detail panel — rendered once at list level */}
      <TaskPanel
        task={panelTask}
        onClose={() => setOpenTask(null)}
      />
    </div>
  );
}
