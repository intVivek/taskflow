import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskForm } from "./task-form";
import { ApiError } from "@/lib/api";

describe("TaskForm", () => {
  it("shows a validation error when submitting an empty title", async () => {
    const onSubmit = vi.fn();
    render(<TaskForm mode="create" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /save|create/i }));
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits parsed values", async () => {
    const onSubmit = vi.fn();
    render(<TaskForm mode="create" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/title/i), "Ship the assessment");
    await userEvent.click(screen.getByRole("button", { name: /save|create/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Ship the assessment",
      status: "todo",
      priority: "medium",
      due_date: null,
    });
  });

  it("maps server 422 field errors onto fields", async () => {
    const onSubmit = vi.fn();
    const serverError = new ApiError(422, "validation_failed", "validation failed", {
      due_date: "must be a date in YYYY-MM-DD format",
    });
    render(<TaskForm mode="create" onSubmit={onSubmit} serverError={serverError} />);
    expect(await screen.findByText("must be a date in YYYY-MM-DD format")).toBeInTheDocument();
  });
});
