"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Task } from "@/lib/types";
import { TaskFormValues } from "@/lib/task-schema";
import { Dialog } from "@/components/ui/dialog";
import { TaskForm } from "./task-form";

// ─── Create dialog ────────────────────────────────────────────────────────────

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateTaskDialog({ open, onClose }: CreateTaskDialogProps) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<ApiError | null>(null);

  const mutation = useMutation({
    mutationFn: (v: TaskFormValues) =>
      api<Task>("/tasks", { method: "POST", body: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
      setServerError(null);
      onClose();
    },
    onError: (e) => {
      setServerError(e as ApiError);
    },
  });

  function handleClose() {
    setServerError(null);
    mutation.reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="New task">
      <TaskForm
        mode="create"
        onSubmit={(v) => mutation.mutate(v)}
        serverError={serverError}
        submitting={mutation.isPending}
      />
    </Dialog>
  );
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────

interface EditTaskDialogProps {
  task: Task;
  open: boolean;
  onClose: () => void;
}

export function EditTaskDialog({ task, open, onClose }: EditTaskDialogProps) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<ApiError | null>(null);

  const initialValues: TaskFormValues = {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    due_date: task.due_date ?? null,
  };

  const mutation = useMutation({
    mutationFn: (v: TaskFormValues) => {
      // Compute diff — only send changed fields
      const diff: Partial<TaskFormValues> = {};
      (Object.keys(v) as (keyof TaskFormValues)[]).forEach((key) => {
        if (v[key] !== initialValues[key]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (diff as any)[key] = v[key];
        }
      });
      // If nothing changed, skip the request and resolve immediately
      if (Object.keys(diff).length === 0) {
        return Promise.resolve(task);
      }
      return api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: diff });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task updated");
      setServerError(null);
      onClose();
    },
    onError: (e) => {
      setServerError(e as ApiError);
    },
  });

  function handleClose() {
    setServerError(null);
    mutation.reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Edit task">
      <TaskForm
        mode="edit"
        defaultValues={initialValues}
        onSubmit={(v) => mutation.mutate(v)}
        serverError={serverError}
        submitting={mutation.isPending}
      />
    </Dialog>
  );
}
