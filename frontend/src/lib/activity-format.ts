// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: number;
  action: string;
  actor_email: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  created_at: string;
}

// ─── Display name maps ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// ─── Date formatting (timezone-safe — no new Date("YYYY-MM-DD") direct format) ─

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Parse "YYYY-MM-DD" string and format as "Mon D, YYYY" without timezone
 * ambiguity that `new Date("YYYY-MM-DD")` (UTC midnight) causes when
 * `.toLocaleDateString()` is called.
 */
function formatDateString(yyyymmdd: string): string {
  const [yearStr, monthStr, dayStr] = yyyymmdd.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-indexed
  const day = parseInt(dayStr, 10);
  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12) {
    return yyyymmdd;
  }
  return `${MONTH_ABBR[month - 1]} ${day}, ${year}`;
}

// ─── humanizeActivity ────────────────────────────────────────────────────────

/**
 * Returns one human-readable sentence per changed aspect.
 * An `updated` entry with title+status → two strings.
 */
export function humanizeActivity(entry: ActivityEntry): string[] {
  const { action, changes } = entry;

  if (action === "created") {
    return ["created this task"];
  }

  if (action === "attachment_added") {
    const filename =
      changes?.filename?.to ??
      changes?.name?.to ??
      null;
    if (typeof filename === "string" && filename) {
      return [`attached "${filename}"`];
    }
    return ["added an attachment"];
  }

  if (action === "attachment_removed") {
    const filename =
      changes?.filename?.from ??
      changes?.name?.from ??
      null;
    if (typeof filename === "string" && filename) {
      return [`removed "${filename}"`];
    }
    return ["removed an attachment"];
  }

  if (action === "updated" || action === "deleted") {
    if (!changes || Object.keys(changes).length === 0) {
      return ["updated this task"];
    }

    const sentences: string[] = [];

    for (const [field, { from, to }] of Object.entries(changes)) {
      switch (field) {
        case "status": {
          const fromLabel = STATUS_LABEL[from as string] ?? String(from);
          const toLabel = STATUS_LABEL[to as string] ?? String(to);
          sentences.push(`moved from ${fromLabel} to ${toLabel}`);
          break;
        }
        case "priority": {
          const fromLabel = PRIORITY_LABEL[from as string] ?? String(from);
          const toLabel = PRIORITY_LABEL[to as string] ?? String(to);
          sentences.push(`changed priority from ${fromLabel} to ${toLabel}`);
          break;
        }
        case "title": {
          sentences.push(`renamed "${from}" to "${to}"`);
          break;
        }
        case "due_date": {
          if (from === null && to !== null) {
            sentences.push(`set the due date to ${formatDateString(to as string)}`);
          } else if (to === null && from !== null) {
            sentences.push("removed the due date");
          } else if (from !== null && to !== null) {
            sentences.push(
              `moved the due date from ${formatDateString(from as string)} to ${formatDateString(to as string)}`,
            );
          }
          break;
        }
        case "description": {
          sentences.push("updated the description");
          break;
        }
        default:
          // Unknown field — skip; will fall back below if nothing produced
          break;
      }
    }

    if (sentences.length === 0) {
      return ["updated this task"];
    }
    return sentences;
  }

  // Unknown action
  return ["updated this task"];
}

// ─── formatRelative ───────────────────────────────────────────────────────────

/**
 * Returns a human-friendly relative time string.
 * - < 60s   → "just now"
 * - < 60min → "Nm ago"
 * - < 24h   → "Nh ago"
 * - ≤ 7d    → "Nd ago"
 * - > 7d    → absolute "Mon D, YYYY" (locale-safe via UTC parts)
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) return "just now";

  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `${diffDays}d ago`;

  // Absolute date — use UTC to avoid timezone shifts from ISO string
  const y = then.getUTCFullYear();
  const m = then.getUTCMonth(); // 0-indexed
  const d = then.getUTCDate();
  return `${MONTH_ABBR[m]} ${d}, ${y}`;
}
