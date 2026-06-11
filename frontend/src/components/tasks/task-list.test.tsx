import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskList } from "./task-list";
import { renderWithProviders, createTestQueryClient } from "@/test/utils";
import type { TaskList as TaskListData } from "@/lib/types";

// ─── next/navigation mock ─────────────────────────────────────────────────────

// Module-level variable so individual tests can swap the searchParams value.
let mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/",
  useSearchParams: () => mockSearchParams,
}));

// ─── @/lib/api mock ───────────────────────────────────────────────────────────

// vi.mock hoists to the top; the mock factory returns a controllable mock.
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: vi.fn(),
  };
});

// Typed reference we can control in each test.
import { api } from "@/lib/api";
const mockApi = api as ReturnType<typeof vi.fn>;

// ─── sonner mock ──────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_RESPONSE: TaskListData = {
  data: [],
  meta: { page: 1, limit: 20, total: 0, total_pages: 0 },
};

function makeTask(overrides: Partial<import("@/lib/types").Task> = {}): import("@/lib/types").Task {
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TaskList", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockReplace.mockClear();
    mockApi.mockReset();
  });

  // 1. Pending state: skeletons visible
  it("shows skeleton rows while data is loading", async () => {
    // Never-resolving promise keeps query in pending state
    mockApi.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<TaskList />);

    // The SkeletonRows component renders a single wrapper with data-testid="task-skeleton"
    const skeletons = screen.getAllByTestId("task-skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // 2. Resolved empty, no active filters → "first task" empty state
  it("shows EmptyNoTasks state when there are no tasks and no active filters", async () => {
    mockSearchParams = new URLSearchParams(); // no status= or q=
    mockApi.mockResolvedValue(EMPTY_RESPONSE);

    renderWithProviders(<TaskList />);

    expect(await screen.findByText("No tasks yet")).toBeInTheDocument();
    // Should NOT show the "no matches" copy
    expect(screen.queryByText("No matching tasks")).not.toBeInTheDocument();
  });

  // 3. Resolved empty with status=done → "no matches" state with Clear filters
  it("shows EmptyNoMatches state with Clear filters when filters are active but return no tasks", async () => {
    mockSearchParams = new URLSearchParams("status=done");
    mockApi.mockResolvedValue(EMPTY_RESPONSE);

    renderWithProviders(<TaskList />);

    expect(await screen.findByText("No matching tasks")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear filters/i }),
    ).toBeInTheDocument();
    // Should NOT show the "no tasks yet" copy
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  // 4. Resolved with 2 tasks → both titles render
  it("renders a row for each task when data resolves with tasks", async () => {
    const task1 = makeTask({ id: "t1", title: "First task title" });
    const task2 = makeTask({ id: "t2", title: "Second task title" });
    mockApi.mockResolvedValue({
      data: [task1, task2],
      meta: { page: 1, limit: 20, total: 2, total_pages: 1 },
    });

    renderWithProviders(<TaskList />);

    expect(await screen.findByText("First task title")).toBeInTheDocument();
    expect(screen.getByText("Second task title")).toBeInTheDocument();
  });

  // 5. Rejected → error state with Retry; clicking Retry triggers a second api call
  it("shows error state with Retry button; clicking Retry calls api again", async () => {
    const networkError = new Error("Network failure");
    mockApi.mockRejectedValue(networkError);

    const queryClient = createTestQueryClient();
    renderWithProviders(<TaskList />, { queryClient });

    // Wait for error state to appear
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: /try again/i });
    expect(retryButton).toBeInTheDocument();

    // api was called once so far (the initial fetch)
    expect(mockApi).toHaveBeenCalledTimes(1);

    // Click Retry → triggers a refetch → second api call
    await userEvent.click(retryButton);

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(2);
    });
  });
});
