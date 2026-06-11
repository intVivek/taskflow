"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { TaskList } from "@/lib/types";
import { buildQuery } from "./use-task-params";

export interface UseTasksParams {
  status?: string;
  q?: string;
  sort?: string;
  order?: string;
  page?: number;
}

export function useTasks({ status, q, sort, order, page }: UseTasksParams) {
  const qs = buildQuery({ status, q, sort, order, page }, {});

  return useQuery<TaskList, ApiError>({
    queryKey: ["tasks", { status, q, sort, order, page }],
    queryFn: ({ signal }) => api<TaskList>(`/tasks${qs}`, { signal }),
    placeholderData: keepPreviousData,
  });
}
