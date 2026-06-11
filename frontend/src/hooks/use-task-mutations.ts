"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Task } from "@/lib/types";

// ─── Toggle complete ──────────────────────────────────────────────────────────

export function useToggleComplete() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) =>
      api<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: { status: task.status === "done" ? "todo" : "done" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => {
      const err = e as ApiError;
      toast.error(err.message ?? "Failed to update task");
    },
  });
}

// ─── Delete task ──────────────────────────────────────────────────────────────

export function useDeleteTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task deleted");
    },
    onError: (e) => {
      const err = e as ApiError;
      toast.error(err.message ?? "Failed to delete task");
    },
  });
}
