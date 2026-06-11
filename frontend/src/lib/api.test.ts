import { describe, expect, it, vi, afterEach } from "vitest";
import { api, ApiError } from "./api";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("returns parsed JSON on success", async () => {
    mockFetchOnce(200, { id: "1", email: "a@b.co" });
    await expect(api("/auth/me")).resolves.toEqual({ id: "1", email: "a@b.co" });
  });

  it("throws ApiError with code, message and fields on error envelope", async () => {
    mockFetchOnce(422, {
      error: { code: "validation_failed", message: "validation failed", fields: { title: "is required" } },
    });
    let err!: ApiError;
    await api("/tasks", { method: "POST", body: {} }).catch((e) => { err = e as ApiError; });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("validation_failed");
    expect(err.fields).toEqual({ title: "is required" });
  });

  it("returns undefined for 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("throws a generic ApiError when the body is not an error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gateway timeout", { status: 504 })));
    let err!: ApiError;
    await api("/tasks").catch((e) => { err = e as ApiError; });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(504);
    expect(err.code).toBe("unknown");
  });
});
