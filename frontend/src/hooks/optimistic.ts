import type { Task, TaskList } from "@/lib/types";

/**
 * Returns a new TaskList with the task matching `id` patched with `patch`.
 * If no task with that id exists, returns the original list reference unchanged.
 * Does NOT touch meta (timestamps are left to the server).
 */
export function patchTaskInList(
  list: TaskList,
  id: string,
  patch: Partial<Task>,
): TaskList {
  const idx = list.data.findIndex((t) => t.id === id);
  if (idx === -1) return list;

  const newData = list.data.map((t, i) =>
    i === idx ? { ...t, ...patch } : t,
  );

  return { ...list, data: newData };
}

/**
 * Returns a new TaskList with the task matching `id` removed.
 * Decrements meta.total and recomputes meta.total_pages.
 * If no task with that id exists, returns the original list reference unchanged.
 */
export function removeTaskFromList(list: TaskList, id: string): TaskList {
  const idx = list.data.findIndex((t) => t.id === id);
  if (idx === -1) return list;

  const newData = list.data.filter((t) => t.id !== id);
  const newTotal = Math.max(0, list.meta.total - 1);
  const newTotalPages = newTotal === 0
    ? 0
    : Math.ceil(newTotal / list.meta.limit);

  return {
    ...list,
    data: newData,
    meta: {
      ...list.meta,
      total: newTotal,
      total_pages: newTotalPages,
    },
  };
}
