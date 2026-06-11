import { describe, expect, it } from "vitest";
import { taskSchema } from "./task-schema";

describe("taskSchema", () => {
  it("accepts a valid task and trims title", () => {
    const r = taskSchema.parse({
      title: "  Ship it  ", description: "", status: "todo", priority: "medium", due_date: "2026-07-01",
    });
    expect(r.title).toBe("Ship it");
    expect(r.due_date).toBe("2026-07-01");
  });
  it("transforms empty due_date to null", () => {
    const r = taskSchema.parse({ title: "x", description: "", status: "todo", priority: "low", due_date: "" });
    expect(r.due_date).toBeNull();
  });
  it("rejects empty and overlong titles", () => {
    expect(taskSchema.safeParse({ title: "", description: "", status: "todo", priority: "low", due_date: null }).success).toBe(false);
    expect(taskSchema.safeParse({ title: "x".repeat(201), description: "", status: "todo", priority: "low", due_date: null }).success).toBe(false);
  });
  it("rejects overlong description", () => {
    expect(taskSchema.safeParse({ title: "x", description: "y".repeat(5001), status: "todo", priority: "low", due_date: null }).success).toBe(false);
  });
  it("rejects malformed due dates and junk enums", () => {
    expect(taskSchema.safeParse({ title: "x", description: "", status: "todo", priority: "low", due_date: "13/01/2026" }).success).toBe(false);
    expect(taskSchema.safeParse({ title: "x", description: "", status: "later", priority: "low", due_date: null }).success).toBe(false);
    expect(taskSchema.safeParse({ title: "x", description: "", status: "todo", priority: "urgent", due_date: null }).success).toBe(false);
  });
});
