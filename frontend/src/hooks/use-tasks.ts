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
  scope?: string;
}

export function useTasks({ status, q, sort, order, page, scope }: UseTasksParams) {
  const qs = buildQuery({ status, q, sort, order, page, scope }, {});

  return useQuery<TaskList, ApiError>({
    queryKey: ["tasks", { status, q, sort, order, page, scope }],
    queryFn: ({ signal }) => api<TaskList>(`/tasks${qs}`, { signal }),
    placeholderData: keepPreviousData,
  });
}
