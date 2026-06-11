import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useTaskEvents } from "./use-task-events";

// ─── Mock EventSource ─────────────────────────────────────────────────────────

interface MockEventSourceInstance {
  url: string;
  addEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  // Store registered handlers so we can fire them in tests
  handlers: Record<string, ((event: MessageEvent) => void)[]>;
  // Helper to fire a named event with given data string
  emit: (type: string, data: string) => void;
}

const mockInstances: MockEventSourceInstance[] = [];

class MockEventSource {
  url: string;
  handlers: Record<string, ((event: MessageEvent) => void)[]> = {};
  addEventListener = vi.fn(
    (type: string, handler: (event: MessageEvent) => void) => {
      if (!this.handlers[type]) this.handlers[type] = [];
      this.handlers[type].push(handler);
    },
  );
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    mockInstances.push(this);
  }

  /** Helper for tests: fire a named event with given data string */
  emit(type: string, data: string) {
    const event = new MessageEvent(type, { data });
    (this.handlers[type] ?? []).forEach((h) => h(event));
  }
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockInstances.length = 0;
  vi.useFakeTimers();
  // Install the mock globally
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useTaskEvents", () => {
  it("constructs EventSource with /api/events on mount", () => {
    const qc = makeQueryClient();
    renderHook(() => useTaskEvents(), { wrapper: makeWrapper(qc) });
    expect(mockInstances).toHaveLength(1);
    expect(mockInstances[0].url).toBe("/api/events");
  });

  it("registers a 'task' event listener", () => {
    const qc = makeQueryClient();
    renderHook(() => useTaskEvents(), { wrapper: makeWrapper(qc) });
    const [instance] = mockInstances;
    expect(instance.addEventListener).toHaveBeenCalledWith("task", expect.any(Function));
  });

  it("invalidates ['tasks'] after 300ms debounce when a task event fires", async () => {
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useTaskEvents(), { wrapper: makeWrapper(qc) });
    const [instance] = mockInstances;

    act(() => {
      instance.emit("task", JSON.stringify({ type: "task.created", task_id: "t1" }));
    });

    // Should NOT have invalidated tasks yet (still within debounce window)
    const tasksCallsBefore = invalidateSpy.mock.calls.filter(
      (args) =>
        Array.isArray((args[0] as { queryKey?: unknown[] }).queryKey) &&
        (args[0] as { queryKey: unknown[] }).queryKey[0] === "tasks",
    );
    expect(tasksCallsBefore).toHaveLength(0);

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const tasksCallsAfter = invalidateSpy.mock.calls.filter(
      (args) =>
        Array.isArray((args[0] as { queryKey?: unknown[] }).queryKey) &&
        (args[0] as { queryKey: unknown[] }).queryKey[0] === "tasks",
    );
    expect(tasksCallsAfter).toHaveLength(1);
  });

  it("immediately invalidates ['activity', task_id] when task_id is present", () => {
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useTaskEvents(), { wrapper: makeWrapper(qc) });
    const [instance] = mockInstances;

    act(() => {
      instance.emit(
        "task",
        JSON.stringify({ type: "task.updated", task_id: "abc-123" }),
      );
    });

    // Activity invalidation should happen immediately (no debounce)
    const activityCalls = invalidateSpy.mock.calls.filter(
      (args) => {
        const key = (args[0] as { queryKey?: unknown[] }).queryKey;
        return Array.isArray(key) && key[0] === "activity" && key[1] === "abc-123";
      },
    );
    expect(activityCalls).toHaveLength(1);
  });

  it("two rapid task events collapse into a single tasks invalidation (debounce)", () => {
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useTaskEvents(), { wrapper: makeWrapper(qc) });
    const [instance] = mockInstances;

    act(() => {
      instance.emit("task", JSON.stringify({ type: "task.created", task_id: "t1" }));
      // fire second event within debounce window
      instance.emit("task", JSON.stringify({ type: "task.updated", task_id: "t2" }));
    });

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const tasksInvalidations = invalidateSpy.mock.calls.filter(
      (args) => {
        const key = (args[0] as { queryKey?: unknown[] }).queryKey;
        return Array.isArray(key) && key[0] === "tasks";
      },
    );
    // Only one tasks invalidation despite two events
    expect(tasksInvalidations).toHaveLength(1);
  });

  it("closes EventSource on unmount", () => {
    const qc = makeQueryClient();
    const { unmount } = renderHook(() => useTaskEvents(), {
      wrapper: makeWrapper(qc),
    });
    const [instance] = mockInstances;

    unmount();

    expect(instance.close).toHaveBeenCalledTimes(1);
  });

  it("does not fire tasks invalidation after unmount (pending timer is cleared)", () => {
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { unmount } = renderHook(() => useTaskEvents(), {
      wrapper: makeWrapper(qc),
    });
    const [instance] = mockInstances;

    act(() => {
      instance.emit("task", JSON.stringify({ type: "task.created" }));
    });

    // Unmount before debounce fires
    unmount();

    // Advance past debounce — should NOT trigger invalidation
    act(() => {
      vi.advanceTimersByTime(400);
    });

    const tasksInvalidations = invalidateSpy.mock.calls.filter(
      (args) => {
        const key = (args[0] as { queryKey?: unknown[] }).queryKey;
        return Array.isArray(key) && key[0] === "tasks";
      },
    );
    expect(tasksInvalidations).toHaveLength(0);
  });

  it("handles malformed JSON gracefully (no throw)", () => {
    const qc = makeQueryClient();
    renderHook(() => useTaskEvents(), { wrapper: makeWrapper(qc) });
    const [instance] = mockInstances;

    // Should not throw even with bad JSON
    expect(() => {
      act(() => {
        instance.emit("task", "not-valid-json");
      });
    }).not.toThrow();
  });
});
