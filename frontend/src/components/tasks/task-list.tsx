"use client";

import { useTaskParams } from "@/hooks/use-task-params";
import { useTasks } from "@/hooks/use-tasks";
import { ListControls } from "./list-controls";
import { TaskRow } from "./task-row";
import { Pagination } from "./pagination";
import {
  SkeletonRows,
  EmptyNoTasks,
  EmptyNoMatches,
  ErrorState,
} from "./list-states";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function TaskList() {
  const params = useTaskParams();
  const { data, isLoading, isError, error, refetch, isFetching } = useTasks(params);

  function handleNewTask() {
    toast.info("Create form arrives in the next step");
  }

  const tasks = data?.data ?? [];
  const meta = data?.meta;

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
        <Button variant="primary" size="sm" onClick={handleNewTask}>
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
          <ErrorState
            message={error?.message}
            onRetry={() => refetch()}
          />
        ) : tasks.length === 0 ? (
          params.hasActiveFilters ? (
            <EmptyNoMatches />
          ) : (
            <EmptyNoTasks />
          )
        ) : (
          tasks.map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </div>

      {/* Pagination */}
      {meta && !isLoading && !isError && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <Pagination meta={meta} />
        </div>
      )}
    </div>
  );
}
