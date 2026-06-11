"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Task, TaskList } from "@/lib/types";
import { patchTaskInList, removeTaskFromList } from "./optimistic";

// ─── Update task (patch) ──────────────────────────────────────────────────────

interface UpdateTaskInput {
  id: string;
  patch: Partial<Omit<Task, "id" | "created_at" | "updated_at">>;
}

export function useUpdateTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: UpdateTaskInput) =>
      api<Task>(`/tasks/${id}`, { method: "PATCH", body: patch }),

    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = qc.getQueriesData<TaskList>({ queryKey: ["tasks"] });
      qc.setQueriesData<TaskList>({ queryKey: ["tasks"] }, (old) =>
        old ? patchTaskInList(old, id, patch) : old,
      );
      return { snapshot };
    },

    onError: (e, _vars, ctx) => {
      // Restore snapshot
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      // Hook-level toast for non-dialog usage (dialog's per-call onError fires separately)
      const err = e as ApiError;
      toast.error(err.message ?? "Couldn't save — change rolled back");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// ─── Toggle complete ──────────────────────────────────────────────────────────

export function useToggleComplete() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) =>
      api<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: { status: task.status === "done" ? "todo" : "done" },
      }),

    onMutate: async (task: Task) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = qc.getQueriesData<TaskList>({ queryKey: ["tasks"] });
      const patch = { status: task.status === "done" ? "todo" : "done" } as Partial<Task>;
      qc.setQueriesData<TaskList>({ queryKey: ["tasks"] }, (old) =>
        old ? patchTaskInList(old, task.id, patch) : old,
      );
      return { snapshot };
    },

    onError: (e, _task, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      const err = e as ApiError;
      toast.error(err.message ?? "Couldn't save — change rolled back");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// ─── Delete task ──────────────────────────────────────────────────────────────

export function useDeleteTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api(`/tasks/${id}`, { method: "DELETE" }),

    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = qc.getQueriesData<TaskList>({ queryKey: ["tasks"] });
      qc.setQueriesData<TaskList>({ queryKey: ["tasks"] }, (old) =>
        old ? removeTaskFromList(old, id) : old,
      );
      return { snapshot };
    },

    onSuccess: () => {
      toast.success("Task deleted");
    },

    onError: (e, _id, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      const err = e as ApiError;
      toast.error(err.message ?? "Couldn't delete — restored");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
