import { describe, it, expect } from "vitest";
import { patchTaskInList, removeTaskFromList } from "./optimistic";
import type { Task, TaskList } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    user_id: "u1",
    title: "Test task",
    description: "",
    status: "todo",
    priority: "medium",
    due_date: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeList(tasks: Task[], meta: Partial<TaskList["meta"]> = {}): TaskList {
  return {
    data: tasks,
    meta: {
      page: 1,
      limit: 20,
      total: tasks.length,
      total_pages: Math.ceil(tasks.length / 20),
      ...meta,
    },
  };
}

// ─── patchTaskInList ──────────────────────────────────────────────────────────

describe("patchTaskInList", () => {
  it("patches a found task with the given partial", () => {
    const task = makeTask({ id: "t1", status: "todo" });
    const list = makeList([task]);
    const result = patchTaskInList(list, "t1", { status: "done" });
    expect(result.data[0].status).toBe("done");
    // other fields unchanged
    expect(result.data[0].title).toBe("Test task");
    expect(result.data[0].id).toBe("t1");
  });

  it("returns the original list reference when id is absent", () => {
    const task = makeTask({ id: "t1" });
    const list = makeList([task]);
    const result = patchTaskInList(list, "nonexistent", { status: "done" });
    expect(result).toBe(list); // exact same reference
  });

  it("does not mutate the original list", () => {
    const task = makeTask({ id: "t1", status: "todo" });
    const list = makeList([task]);
    patchTaskInList(list, "t1", { status: "done" });
    // original unchanged
    expect(list.data[0].status).toBe("todo");
    expect(task.status).toBe("todo");
  });

  it("does not mutate other rows (structural sharing ok but original rows untouched)", () => {
    const task1 = makeTask({ id: "t1", title: "First" });
    const task2 = makeTask({ id: "t2", title: "Second" });
    const list = makeList([task1, task2]);
    const result = patchTaskInList(list, "t1", { title: "Patched" });
    // t1 is changed
    expect(result.data[0].title).toBe("Patched");
    // t2 untouched (can be same reference)
    expect(result.data[1].title).toBe("Second");
    // original task2 unchanged
    expect(task2.title).toBe("Second");
  });

  it("patches multiple fields at once", () => {
    const task = makeTask({ id: "t1", status: "todo", priority: "low" });
    const list = makeList([task]);
    const result = patchTaskInList(list, "t1", {
      status: "done",
      priority: "high",
      title: "Updated",
    });
    expect(result.data[0].status).toBe("done");
    expect(result.data[0].priority).toBe("high");
    expect(result.data[0].title).toBe("Updated");
  });

  it("does not touch meta when patching", () => {
    const task = makeTask({ id: "t1" });
    const list = makeList([task], { page: 2, limit: 10, total: 50, total_pages: 5 });
    const result = patchTaskInList(list, "t1", { status: "done" });
    expect(result.meta).toEqual(list.meta);
  });

  it("handles empty data array with missing id gracefully", () => {
    const list = makeList([]);
    const result = patchTaskInList(list, "ghost", { status: "done" });
    expect(result).toBe(list);
  });
});

// ─── removeTaskFromList ───────────────────────────────────────────────────────

describe("removeTaskFromList", () => {
  it("removes a found task and decrements total", () => {
    const tasks = [
      makeTask({ id: "t1" }),
      makeTask({ id: "t2" }),
      makeTask({ id: "t3" }),
    ];
    const list = makeList(tasks, { total: 3, total_pages: 1, limit: 20 });
    const result = removeTaskFromList(list, "t2");
    expect(result.data).toHaveLength(2);
    expect(result.data.find((t) => t.id === "t2")).toBeUndefined();
    expect(result.meta.total).toBe(2);
  });

  it("returns the original list reference when id is absent", () => {
    const task = makeTask({ id: "t1" });
    const list = makeList([task]);
    const result = removeTaskFromList(list, "nonexistent");
    expect(result).toBe(list);
  });

  it("does not mutate the original list", () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
    const list = makeList(tasks);
    removeTaskFromList(list, "t1");
    expect(list.data).toHaveLength(2);
  });

  it("recomputes total_pages correctly (boundary: 21→20 with limit 20 drops page)", () => {
    const tasks = Array.from({ length: 20 }, (_, i) =>
      makeTask({ id: `t${i}`, title: `Task ${i}` }),
    );
    // Simulate a list that has total:21 but we only have page 1 (20 tasks visible)
    const list = makeList(tasks, { total: 21, limit: 20, total_pages: 2 });
    const result = removeTaskFromList(list, "t0");
    expect(result.meta.total).toBe(20);
    expect(result.meta.total_pages).toBe(1); // ceil(20/20) = 1
  });

  it("recomputes total_pages to 0 when list becomes empty", () => {
    const task = makeTask({ id: "t1" });
    const list = makeList([task], { total: 1, limit: 20, total_pages: 1 });
    const result = removeTaskFromList(list, "t1");
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.total_pages).toBe(0); // max(0, ceil(0/20)) = 0
  });

  it("handles empty list with missing id", () => {
    const list = makeList([]);
    const result = removeTaskFromList(list, "ghost");
    expect(result).toBe(list);
  });

  it("keeps other task data intact after removal", () => {
    const task1 = makeTask({ id: "t1", title: "Keep me" });
    const task2 = makeTask({ id: "t2", title: "Remove me" });
    const list = makeList([task1, task2], { total: 2 });
    const result = removeTaskFromList(list, "t2");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe("Keep me");
    expect(result.data[0].id).toBe("t1");
  });
});
