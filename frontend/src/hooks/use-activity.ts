"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ActivityEntry } from "@/lib/activity-format";

interface ActivityResponse {
  data: ActivityEntry[];
}

export function useActivity(taskId: string | null) {
  return useQuery<ActivityEntry[]>({
    queryKey: ["activity", taskId],
    queryFn: async ({ signal }) => {
      const res = await api<ActivityResponse>(`/tasks/${taskId}/activity`, { signal });
      return res.data ?? [];
    },
    enabled: !!taskId,
    staleTime: 10_000,
  });
}
