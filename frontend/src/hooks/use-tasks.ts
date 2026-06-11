"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { TaskList } from "@/lib/types";
import type { TaskParams } from "./use-task-params";

const DEFAULTS = {
  status: "",
  q: "",
  sort: "created_at",
  order: "desc",
  page: 1,
};

function buildApiQuery(params: TaskParams): string {
  const p = new URLSearchParams();

  if (params.status && params.status !== DEFAULTS.status) {
    p.set("status", params.status);
  }
  if (params.q && params.q !== DEFAULTS.q) {
    p.set("q", params.q);
  }
  if (params.sort && params.sort !== DEFAULTS.sort) {
    p.set("sort", params.sort);
  }
  if (params.order && params.order !== DEFAULTS.order) {
    p.set("order", params.order);
  }
  if (params.page && params.page !== DEFAULTS.page) {
    p.set("page", String(params.page));
  }

  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function useTasks(params: TaskParams) {
  const qs = buildApiQuery(params);

  return useQuery<TaskList, ApiError>({
    queryKey: ["tasks", params],
    queryFn: ({ signal }) => api<TaskList>(`/tasks${qs}`, { signal }),
    placeholderData: keepPreviousData,
  });
}
