"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ListMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTaskParams } from "@/hooks/use-task-params";

interface PaginationProps {
  meta: ListMeta;
  /** True while the next page is being fetched — disables the controls. */
  loading?: boolean;
}

export function Pagination({ meta, loading = false }: PaginationProps) {
  const { page, set } = useTaskParams();

  if (meta.total_pages <= 1) return null;

  const currentPage = page ?? 1;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="flex items-center gap-2 text-xs text-text-muted">
        Page {currentPage} of {meta.total_pages} · {meta.total} task
        {meta.total !== 1 ? "s" : ""}
        {loading && <Spinner size={12} />}
      </span>

      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1 || loading}
          onClick={() => set({ page: currentPage - 1 })}
          aria-label="Previous page"
          className="h-11 sm:h-7 px-3 sm:px-2.5"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Prev</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage >= meta.total_pages || loading}
          onClick={() => set({ page: currentPage + 1 })}
          aria-label="Next page"
          className="h-11 sm:h-7 px-3 sm:px-2.5"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
