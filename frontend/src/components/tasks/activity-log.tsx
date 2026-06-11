"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivity } from "@/hooks/use-activity";
import { useUser } from "@/hooks/use-user";
import { humanizeActivity, formatRelative, type ActivityEntry } from "@/lib/activity-format";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-0" aria-busy="true" aria-label="Loading activity">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 relative">
          {/* Line segment */}
          <div className="flex flex-col items-center shrink-0 w-4">
            <div className="w-[5px] h-[5px] rounded-full bg-border mt-[3px] shrink-0" />
            {i < 2 && <div className="w-px flex-1 bg-border mt-1 min-h-[28px]" />}
          </div>

          {/* Content skeleton */}
          <div className="pb-4 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-3 w-12 rounded" />
            </div>
            <Skeleton className="h-3 w-full rounded" />
            {i === 1 && <Skeleton className="h-3 w-3/4 rounded mt-1" />}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ActivityItemProps {
  entry: ActivityEntry;
  isFirst: boolean;
  isLast: boolean;
  currentUserEmail: string | undefined;
}

function ActivityItem({ entry, isFirst, isLast, currentUserEmail }: ActivityItemProps) {
  const sentences = humanizeActivity(entry);
  const isCurrentUser = entry.actor_email === currentUserEmail;
  const actorLabel = entry.actor_email
    ? isCurrentUser
      ? "you"
      : entry.actor_email
    : "system";

  const relativeTime = formatRelative(entry.created_at);

  return (
    <div role="listitem" className="flex gap-3 relative">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0 w-4">
        {/* Dot */}
        <div
          className={`
            w-[6px] h-[6px] rounded-full shrink-0 mt-[3px]
            transition-colors duration-150
            ${isFirst ? "bg-accent" : "bg-border-strong"}
          `}
          style={
            isFirst
              ? {
                  boxShadow: "0 0 0 2px var(--color-accent-subtle)",
                }
              : undefined
          }
        />
        {/* Connector line */}
        {!isLast && (
          <div
            className="w-px flex-1 mt-1 min-h-[20px]"
            style={{
              background: isFirst
                ? "linear-gradient(to bottom, var(--color-border-strong), var(--color-border))"
                : "var(--color-border)",
            }}
          />
        )}
      </div>

      {/* Entry content */}
      <div className={`flex-1 min-w-0 ${isLast ? "pb-1" : "pb-4"}`}>
        {/* Actor + time row */}
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span
            className={`
              text-xs font-medium truncate
              ${isCurrentUser ? "text-accent" : "text-text-secondary"}
            `}
          >
            {actorLabel}
          </span>
          <span
            className="text-xs text-text-muted whitespace-nowrap shrink-0 tabular-nums"
            title={new Date(entry.created_at).toLocaleString()}
          >
            {relativeTime}
          </span>
        </div>

        {/* Sentences */}
        <div className="flex flex-col gap-0.5">
          {sentences.map((sentence, idx) => (
            <p key={idx} className="text-xs text-text leading-relaxed">
              {sentence}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ActivityLogProps {
  taskId: string;
}

export function ActivityLog({ taskId }: ActivityLogProps) {
  const [showAll, setShowAll] = useState(false);
  const { data: entries, isLoading, isError } = useActivity(taskId);
  const { data: user } = useUser();

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Activity
        </span>
        <TimelineSkeleton />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Activity
        </span>
        <p className="text-xs text-text-muted italic">Couldn&apos;t load activity.</p>
      </div>
    );
  }

  const allEntries = entries ?? [];
  const total = allEntries.length;
  const displayed = showAll ? allEntries : allEntries.slice(0, PAGE_SIZE);
  const hasMore = !showAll && total > PAGE_SIZE;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Heading */}
      <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
        Activity
      </span>

      {/* Empty state */}
      {total === 0 ? (
        <p className="text-xs text-text-muted italic">No activity yet.</p>
      ) : (
        <>
          {/* Timeline */}
          <div role="list" className="flex flex-col gap-0">
            {displayed.map((entry, idx) => (
              <ActivityItem
                key={entry.id}
                entry={entry}
                isFirst={idx === 0}
                isLast={idx === displayed.length - 1 && !hasMore}
                currentUserEmail={user?.email}
              />
            ))}
          </div>

          {/* Show all button */}
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="
                mt-1 self-start
                text-xs text-text-muted
                hover:text-text
                underline underline-offset-2
                decoration-border-strong
                hover:decoration-text-muted
                transition-colors duration-150
                cursor-pointer
                focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
              "
            >
              Show all ({total})
            </button>
          )}
        </>
      )}
    </div>
  );
}
