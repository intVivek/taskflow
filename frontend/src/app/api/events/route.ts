import { NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8080";

/**
 * SSE proxy — forwards /api/events to the backend without buffering.
 *
 * Next.js rewrites apply gzip compression to all proxied responses, which
 * breaks SSE by buffering events in the compressor until a chunk boundary is
 * reached.  This route handler bypasses that by piping the backend stream
 * directly while explicitly setting Transfer-Encoding and disabling
 * Content-Encoding.
 */
export async function GET(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";
  const url = `${API_URL}/events`;

  const backendRes = await fetch(url, {
    headers: {
      cookie,
      accept: "text/event-stream",
      "cache-control": "no-cache",
    },
    // Node.js fetch: disable response body compression so we get raw bytes
    // @ts-expect-error — Next.js uses Node.js fetch which accepts `compress`
    compress: false,
  });

  if (!backendRes.ok || !backendRes.body) {
    return new Response(JSON.stringify({ error: "upstream error" }), {
      status: backendRes.status,
      headers: { "content-type": "application/json" },
    });
  }

  const headers = new Headers({
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    // Explicitly disable content encoding so the browser receives raw UTF-8
    // without waiting for gzip block boundaries.
    "content-encoding": "identity",
  });

  return new Response(backendRes.body, { status: 200, headers });
}
