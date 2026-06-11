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
});
