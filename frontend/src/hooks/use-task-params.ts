"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface TaskParams {
  status?: string;
  q?: string;
  sort?: string;
  order?: string;
  page?: number;
}

const DEFAULTS: Required<TaskParams> = {
  status: "",
  q: "",
  sort: "created_at",
  order: "desc",
  page: 1,
};

// Stable serialization order
const KEY_ORDER: (keyof TaskParams)[] = ["status", "q", "sort", "order", "page"];

/**
 * Pure function: merges patch into current params, resets page to 1 when any
 * non-page key changes, strips defaults, returns "?..." or "".
 */
export function buildQuery(
  current: TaskParams,
  patch: Partial<TaskParams>,
): string {
  // Determine if any non-page key is changing
  const filterKeysChanging = (Object.keys(patch) as (keyof TaskParams)[]).some(
    (k) => k !== "page",
  );

  const merged: TaskParams = { ...current, ...patch };

  // Reset page when filter/search/sort keys change
  if (filterKeysChanging) {
    merged.page = 1;
  }

  const params = new URLSearchParams();

  for (const key of KEY_ORDER) {
    const value = merged[key];
    const def = DEFAULTS[key];

    if (value === undefined || value === null) continue;

    // Compare as strings for consistent default detection
    const strVal = String(value);
    const strDef = String(def);

    if (strVal === strDef || strVal === "") continue;

    params.set(key, strVal);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Client-side hook: reads URL search params into TaskParams, exposes a `set`
 * function for updating filters via router.replace (no scroll).
 */
export function useTaskParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  const current: TaskParams = {
    status: searchParams.get("status") ?? "",
    q: searchParams.get("q") ?? "",
    sort: searchParams.get("sort") ?? "created_at",
    order: searchParams.get("order") ?? "desc",
    page,
  };

  function set(patch: Partial<TaskParams>) {
    const qs = buildQuery(current, patch);
    router.replace(pathname + qs, { scroll: false });
  }

  // hasActiveFilters: true only if status or q are non-default
  const hasActiveFilters =
    (current.status !== "" && current.status !== undefined) ||
    (current.q !== "" && current.q !== undefined);

  return { ...current, set, hasActiveFilters };
}
