import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskSchema, TaskFormValues } from "@/lib/task-schema";
import { ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const KNOWN_FIELDS: (keyof TaskFormValues)[] = [
  "title",
  "description",
  "status",
  "priority",
  "due_date",
];

interface TaskFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<TaskFormValues>;
  onSubmit: (v: TaskFormValues) => void;
  serverError?: ApiError | null;
  submitting?: boolean;
}

export function TaskForm({
  mode,
  defaultValues,
  onSubmit,
  serverError,
  submitting = false,
}: TaskFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      due_date: null,
      ...defaultValues,
    },
  });

  // Map server 422 field errors onto fields
  useEffect(() => {
    if (!serverError?.fields) return;
    for (const field of KNOWN_FIELDS) {
      const msg = serverError.fields[field];
      if (msg) {
        setError(field, { type: "server", message: msg });
      }
    }
  }, [serverError, setError]);

  const description = watch("description") ?? "";
  const descLen = description.length;
  const showCounter = descLen > 4500;
  const counterDanger = descLen > 5000;

  function onValid(values: TaskFormValues) {
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate className="flex flex-col gap-4">
      {/* Title */}
      <Input
        label="Title"
        autoFocus
        placeholder="What needs to be done?"
        error={errors.title?.message}
        {...register("title")}
      />

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="task-description"
          className="text-xs font-medium text-text-secondary"
        >
          Description
          {showCounter && (
            <span
              className={`ml-2 tabular-nums ${counterDanger ? "text-danger" : "text-text-muted"}`}
            >
              {descLen} / 5000
            </span>
          )}
        </label>
        <textarea
          id="task-description"
          rows={4}
          placeholder="Add more details..."
          aria-invalid={Boolean(errors.description) || undefined}
          aria-describedby={errors.description ? "task-description-error" : undefined}
          className={`
            px-3 py-2 rounded-md text-sm
            bg-surface text-text
            border transition-colors duration-150
            placeholder:text-text-muted
            resize-none
            focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0
            disabled:opacity-50 disabled:cursor-not-allowed
            ${errors.description
              ? "border-danger focus-visible:outline-danger"
              : "border-border hover:border-border-strong focus-visible:border-accent"
            }
          `}
          {...register("description")}
        />
        {errors.description && (
          <span id="task-description-error" className="text-xs text-danger">
            {errors.description.message}
          </span>
        )}
      </div>

      {/* Priority + Due date row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Priority"
          error={errors.priority?.message}
          {...register("priority")}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>

        <Input
          label="Due date"
          type="date"
          error={errors.due_date?.message}
          {...register("due_date", {
            setValueAs: (v: string) => (v === "" ? null : v),
          })}
        />
      </div>

      {/* Status — edit mode only */}
      {mode === "edit" && (
        <Select
          label="Status"
          error={errors.status?.message}
          {...register("status")}
        >
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </Select>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={submitting}
        >
          {mode === "create" ? "Create task" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
