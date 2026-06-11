import { describe, it, expect } from "vitest";
import { humanizeActivity, formatRelative, type ActivityEntry } from "./activity-format";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 1,
    action: "created",
    actor_email: "user@example.com",
    changes: null,
    created_at: "2026-06-11T12:00:00Z",
    ...overrides,
  };
}

// ─── humanizeActivity ─────────────────────────────────────────────────────────

describe("humanizeActivity", () => {
  it("returns 'created this task' for action=created", () => {
    const entry = makeEntry({ action: "created" });
    expect(humanizeActivity(entry)).toEqual(["created this task"]);
  });

  it("handles status change from todo to in_progress", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { status: { from: "todo", to: "in_progress" } },
    });
    expect(humanizeActivity(entry)).toContain("moved from To do to In progress");
  });

  it("handles status change from in_progress to done", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { status: { from: "in_progress", to: "done" } },
    });
    expect(humanizeActivity(entry)).toContain("moved from In progress to Done");
  });

  it("handles priority change", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { priority: { from: "low", to: "high" } },
    });
    expect(humanizeActivity(entry)).toContain("changed priority from Low to High");
  });

  it("handles title rename", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { title: { from: "Old Title", to: "New Title" } },
    });
    expect(humanizeActivity(entry)).toContain('renamed "Old Title" to "New Title"');
  });

  it("handles due_date set from null", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { due_date: { from: null, to: "2026-06-20" } },
    });
    expect(humanizeActivity(entry)).toContain("set the due date to Jun 20, 2026");
  });

  it("handles due_date cleared to null", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { due_date: { from: "2026-06-20", to: null } },
    });
    expect(humanizeActivity(entry)).toContain("removed the due date");
  });

  it("handles due_date moved from one date to another", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { due_date: { from: "2026-06-20", to: "2026-07-01" } },
    });
    expect(humanizeActivity(entry)).toContain(
      "moved the due date from Jun 20, 2026 to Jul 1, 2026",
    );
  });

  it("handles description update", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { description: { from: "old", to: "new" } },
    });
    expect(humanizeActivity(entry)).toContain("updated the description");
  });

  it("returns multiple sentences for an updated entry with multiple changes", () => {
    const entry = makeEntry({
      action: "updated",
      changes: {
        title: { from: "Old", to: "New" },
        status: { from: "todo", to: "in_progress" },
      },
    });
    const result = humanizeActivity(entry);
    expect(result).toHaveLength(2);
    expect(result).toContain('renamed "Old" to "New"');
    expect(result).toContain("moved from To do to In progress");
  });

  it("handles attachment_added with filename", () => {
    const entry = makeEntry({
      action: "attachment_added",
      changes: { filename: { from: null, to: "report.pdf" } },
    });
    expect(humanizeActivity(entry)).toContain('attached "report.pdf"');
  });

  it("handles attachment_added without filename falls back gracefully", () => {
    const entry = makeEntry({
      action: "attachment_added",
      changes: null,
    });
    expect(humanizeActivity(entry)).toContain("added an attachment");
  });

  it("handles attachment_removed with filename", () => {
    const entry = makeEntry({
      action: "attachment_removed",
      changes: { filename: { from: "report.pdf", to: null } },
    });
    expect(humanizeActivity(entry)).toContain('removed "report.pdf"');
  });

  it("handles attachment_removed without filename falls back gracefully", () => {
    const entry = makeEntry({
      action: "attachment_removed",
      changes: null,
    });
    expect(humanizeActivity(entry)).toContain("removed an attachment");
  });

  it("falls back to 'updated this task' for unknown action", () => {
    const entry = makeEntry({ action: "some_unknown_action", changes: null });
    expect(humanizeActivity(entry)).toEqual(["updated this task"]);
  });

  it("falls back gracefully for updated with unknown change field", () => {
    const entry = makeEntry({
      action: "updated",
      changes: { some_unknown_field: { from: "a", to: "b" } },
    });
    expect(humanizeActivity(entry)).toEqual(["updated this task"]);
  });

  it("handles updated with null changes (no diff info)", () => {
    const entry = makeEntry({ action: "updated", changes: null });
    expect(humanizeActivity(entry)).toEqual(["updated this task"]);
  });
});

// ─── formatRelative ───────────────────────────────────────────────────────────

describe("formatRelative", () => {
  const baseNow = new Date("2026-06-11T12:00:00Z");

  it("returns 'just now' when less than 60 seconds ago", () => {
    const iso = new Date(baseNow.getTime() - 30 * 1000).toISOString();
    expect(formatRelative(iso, baseNow)).toBe("just now");
  });

  it("returns 'just now' at exactly 59 seconds", () => {
    const iso = new Date(baseNow.getTime() - 59 * 1000).toISOString();
    expect(formatRelative(iso, baseNow)).toBe("just now");
  });

  it("returns minutes for 1-59 minutes", () => {
    const iso = new Date(baseNow.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelative(iso, baseNow)).toBe("5m ago");
  });

  it("returns hours for 1-23 hours", () => {
    const iso = new Date(baseNow.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(iso, baseNow)).toBe("3h ago");
  });

  it("returns days for 1-7 days", () => {
    const iso = new Date(baseNow.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(iso, baseNow)).toBe("2d ago");
  });

  it("returns absolute date beyond 7 days", () => {
    const iso = new Date(baseNow.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    // 2026-06-11 minus 8 days = 2026-06-03
    expect(formatRelative(iso, baseNow)).toBe("Jun 3, 2026");
  });

  it("handles exact 60 seconds as 1m ago", () => {
    const iso = new Date(baseNow.getTime() - 60 * 1000).toISOString();
    expect(formatRelative(iso, baseNow)).toBe("1m ago");
  });

  it("handles exact 7 days as 7d ago", () => {
    const iso = new Date(baseNow.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(iso, baseNow)).toBe("7d ago");
  });
});
