"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Task } from "@/lib/types";
import { TaskFormValues } from "@/lib/task-schema";
import { Dialog } from "@/components/ui/dialog";
import { TaskForm } from "./task-form";
import { useUpdateTask } from "@/hooks/use-task-mutations";

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
      const err = e as ApiError;
      setServerError(err);
      if (!(err instanceof ApiError) || !err.fields || Object.keys(err.fields).length === 0) {
        toast.error(err.message ?? "Something went wrong");
      }
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
  const [serverError, setServerError] = useState<ApiError | null>(null);
  const updateTask = useUpdateTask();

  const initialValues: TaskFormValues = {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    due_date: task.due_date ?? null,
  };

  // Wrap useUpdateTask with local serverError / field-mapping logic
  const mutation = {
    isPending: updateTask.isPending,
    reset: updateTask.reset,
    mutate: (v: TaskFormValues) => {
      // Compute diff — only send changed fields
      const diff = (Object.keys(v) as (keyof TaskFormValues)[]).reduce<
        Partial<TaskFormValues>
      >((acc, key) => (v[key] !== initialValues[key] ? { ...acc, [key]: v[key] } : acc), {});
      // If nothing changed, skip the request and resolve immediately
      if (Object.keys(diff).length === 0) {
        toast.success("Task updated");
        setServerError(null);
        onClose();
        return;
      }
      updateTask.mutate(
        { id: task.id, patch: diff },
        {
          onSuccess: () => {
            toast.success("Task updated");
            setServerError(null);
            onClose();
          },
          onError: (e) => {
            const err = e as ApiError;
            setServerError(err);
            if (!(err instanceof ApiError) || !err.fields || Object.keys(err.fields).length === 0) {
              toast.error(err.message ?? "Something went wrong");
            }
          },
        },
      );
    },
  };

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
