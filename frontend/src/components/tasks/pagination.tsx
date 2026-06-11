"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ListMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useTaskParams } from "@/hooks/use-task-params";

interface PaginationProps {
  meta: ListMeta;
}

export function Pagination({ meta }: PaginationProps) {
  const { page, set } = useTaskParams();

  if (meta.total_pages <= 1) return null;

  const currentPage = page ?? 1;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-xs text-text-muted">
        Page {currentPage} of {meta.total_pages} · {meta.total} task
        {meta.total !== 1 ? "s" : ""}
      </span>

      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => set({ page: currentPage - 1 })}
        >
          <ChevronLeft size={14} />
          Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage >= meta.total_pages}
          onClick={() => set({ page: currentPage + 1 })}
        >
          Next
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
