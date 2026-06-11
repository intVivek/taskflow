import { describe, expect, it, vi, afterEach } from "vitest";
import { api, apiUpload, ApiError } from "./api";

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

describe("apiUpload", () => {
  it("returns parsed JSON on 201 success", async () => {
    const attachment = { id: "att-1", task_id: "t-1", filename: "test.png", content_type: "image/png", size_bytes: 100, created_at: "2024-01-01T00:00:00Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(attachment), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const file = new File(["hello"], "test.png", { type: "image/png" });
    await expect(apiUpload("/tasks/t-1/attachments", file)).resolves.toEqual(attachment);

    // Verify no manual Content-Type was set (FormData boundary must be browser-set)
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const requestInit = calls[0][1] as RequestInit;
    const headers = requestInit.headers as Record<string, string> | undefined;
    expect(headers).toBeUndefined();
  });

  it("throws ApiError with field message on 422 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "validation_failed",
              message: "validation failed",
              fields: { file: "unsupported file type" },
            },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const file = new File(["x"], "bad.exe", { type: "application/octet-stream" });
    let err!: ApiError;
    await apiUpload("/tasks/t-1/attachments", file).catch((e) => { err = e as ApiError; });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.fields?.file).toBe("unsupported file type");
  });

  it("throws ApiError with status 413 when file is too large", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "payload_too_large", message: "file too large" } }),
          { status: 413, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const bigFile = new File(["x".repeat(100)], "big.png", { type: "image/png" });
    let err!: ApiError;
    await apiUpload("/tasks/t-1/attachments", bigFile).catch((e) => { err = e as ApiError; });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(413);
    expect(err.code).toBe("payload_too_large");
  });
});
