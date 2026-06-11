"use client";

// Subscribes to the backend SSE stream and nudges TanStack Query caches when
// tasks change. Events are wakeup signals — the cache refetches authoritative
// data rather than patching from the event payload.

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface TaskEventData {
  type: "task.created" | "task.updated" | "task.deleted";
  task?: unknown;
  task_id?: string;
}

export function useTaskEvents() {
  const qc = useQueryClient();
  // Ref for the debounce timer — survives re-renders, safe in StrictMode double-mount
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");

    function handler(event: MessageEvent) {
      let data: TaskEventData;
      try {
        data = JSON.parse(event.data) as TaskEventData;
      } catch {
        return;
      }

      // Immediately invalidate the specific task's activity log when we know the id
      if (data.task_id) {
        qc.invalidateQueries({ queryKey: ["activity", data.task_id] });
      }

      // Debounce the broad tasks invalidation (300ms trailing) so rapid bursts
      // of events collapse into a single refetch.
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ["tasks"] });
      }, 300);
    }

    es.addEventListener("task", handler);

    return () => {
      // Clear any pending debounce timer before closing
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      es.close();
    };
  }, [qc]);
}
