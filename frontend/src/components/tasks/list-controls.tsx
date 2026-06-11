"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, ArrowUp, ArrowDown } from "lucide-react";
import { useTaskParams } from "@/hooks/use-task-params";
import { useUser } from "@/hooks/use-user";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "To do", value: "todo" },
  { label: "In progress", value: "in_progress" },
  { label: "Done", value: "done" },
] as const;

const SORT_OPTIONS = [
  { label: "Created", value: "created_at" },
  { label: "Due date", value: "due_date" },
  { label: "Priority", value: "priority" },
] as const;

export function ListControls() {
  const { status, q, sort, order, scope, set } = useTaskParams();
  const { data: me } = useUser();
  const isAdmin = me?.role === "admin";

  // Local search state — synced from URL, debounced write back
  const [searchValue, setSearchValue] = useState(q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  // Sync search value when URL changes externally (e.g. clear filters)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSearchValue(q ?? "");
  }, [q]);

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      set({ q: value });
    }, 300);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSearchValue("");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      set({ q: "" });
      (e.target as HTMLInputElement).blur();
    }
  }

  function clearSearch() {
    setSearchValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    set({ q: "" });
  }

  const activeSort = sort ?? "created_at";
  const activeOrder = order ?? "desc";
  const isAllTasks = scope === "all";

  function toggleOrder() {
    set({ order: activeOrder === "asc" ? "desc" : "asc" });
  }

  function handleAllTasksToggle() {
    set({ scope: isAllTasks ? "" : "all" });
  }

  return (
    <div className="space-y-3">
      {/* Status tabs — horizontal scroll with hidden scrollbar on small screens */}
      <div
        role="tablist"
        aria-label="Filter by status"
        className="
          flex items-center border-b border-border
          overflow-x-auto
          scrollbar-none [&::-webkit-scrollbar]:hidden
        "
      >
        {STATUS_TABS.map((tab) => {
          const isActive = (status ?? "") === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => set({ status: tab.value })}
              className={`
                shrink-0
                px-3 pb-2.5 pt-1 text-sm font-medium transition-colors duration-150 cursor-pointer
                border-b-2 -mb-px
                /* Ensure minimum 44px tap height on touch */
                min-h-[44px] flex items-center
                ${
                  isActive
                    ? "border-accent text-text"
                    : "border-transparent text-text-muted hover:text-text-secondary hover:border-border-strong"
                }
              `}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search + Sort row — stacks to search-full-width on mobile */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Search — full width on its own line on mobile */}
        <div className="relative flex-1 min-w-0">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="
              w-full h-9 sm:h-8 pl-8 pr-8 rounded-md text-sm
              bg-surface text-text
              border border-border
              placeholder:text-text-muted
              hover:border-border-strong
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0 focus-visible:border-accent
              transition-colors duration-150
            "
          />
          {searchValue && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="
                absolute right-0 top-1/2 -translate-y-1/2 p-2
                text-text-muted hover:text-text
                transition-colors duration-150 cursor-pointer
              "
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Sort controls row — always in one line */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sort select */}
          <select
            value={activeSort}
            onChange={(e) => set({ sort: e.target.value })}
            aria-label="Sort by"
            className="
              flex-1 sm:flex-none
              h-9 sm:h-8 px-2.5 rounded-md text-sm
              bg-surface text-text
              border border-border
              hover:border-border-strong
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0
              transition-colors duration-150 cursor-pointer
            "
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Direction toggle — min 44px tap target */}
          <button
            type="button"
            onClick={toggleOrder}
            aria-label={activeOrder === "asc" ? "Sort ascending" : "Sort descending"}
            title={activeOrder === "asc" ? "Ascending" : "Descending"}
            className="
              inline-flex items-center justify-center h-9 sm:h-8 w-9 sm:w-8 rounded-md
              bg-surface text-text-secondary
              border border-border
              hover:bg-raised hover:text-text hover:border-border-strong
              transition-colors duration-150 cursor-pointer
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
            "
          >
            {activeOrder === "asc" ? (
              <ArrowUp size={14} />
            ) : (
              <ArrowDown size={14} />
            )}
          </button>

          {/* Admin-only: All tasks toggle */}
          {isAdmin && (
            <label
              className="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
              title="Show tasks from all users"
            >
              <button
                type="button"
                role="switch"
                aria-checked={isAllTasks}
                aria-label="All tasks"
                onClick={handleAllTasksToggle}
                className={`
                  relative inline-flex items-center h-5 w-9 rounded-full
                  border-2 border-transparent
                  transition-colors duration-150 cursor-pointer
                  focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
                  ${isAllTasks ? "bg-accent" : "bg-border-strong"}
                `}
              >
                <span
                  className={`
                    inline-block h-3.5 w-3.5 rounded-full bg-white shadow
                    transition-transform duration-150
                    ${isAllTasks ? "translate-x-4" : "translate-x-0.5"}
                  `}
                />
              </button>
              <span className="text-xs font-medium text-text-muted">All tasks</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
