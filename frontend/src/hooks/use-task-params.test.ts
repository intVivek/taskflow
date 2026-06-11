import { describe, expect, it } from "vitest";
import { buildQuery } from "./use-task-params";

describe("buildQuery", () => {
  it("omits defaults", () => {
    expect(buildQuery({}, {})).toBe("");
  });
  it("sets and merges params", () => {
    expect(buildQuery({ status: "todo" }, { q: "report" })).toBe("?status=todo&q=report");
  });
  it("resets page when filters change", () => {
    expect(buildQuery({ page: 3 }, { status: "done" })).toBe("?status=done");
  });
  it("keeps page when only page changes", () => {
    expect(buildQuery({ status: "todo" }, { page: 2 })).toBe("?status=todo&page=2");
  });
  it("drops a param set back to default", () => {
    expect(buildQuery({ status: "todo" }, { status: "" })).toBe("");
  });

  // ── scope tests ──────────────────────────────────────────────────────────
  it("includes scope=all when set", () => {
    expect(buildQuery({}, { scope: "all" })).toBe("?scope=all");
  });
  it("drops scope when empty (default)", () => {
    expect(buildQuery({ scope: "all" }, { scope: "" })).toBe("");
  });
  it("scope change resets page", () => {
    // page=3, set scope=all → page resets to 1 (omitted as default)
    expect(buildQuery({ page: 3 }, { scope: "all" })).toBe("?scope=all");
  });
  it("scope appears after page in query string (page resets on scope change)", () => {
    // Changing scope is a filter-key change → page resets to 1 (omitted as default)
    expect(buildQuery({ status: "todo", page: 2 }, { scope: "all" })).toBe(
      "?status=todo&scope=all"
    );
  });
});
