import { test, expect } from "@playwright/test";

const TEST_EMAIL = "sse-live@test.com";
const TEST_PASSWORD = "Test1234!";
const BASE = "http://localhost:3001";
const API_BASE = "http://localhost:8082";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Register (idempotent) then login via API; inject session cookie into given page. */
async function loginViaAPI(page: import("@playwright/test").Page) {
  await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/taskflow_session=([^;]+)/);
  if (!match) throw new Error("Login failed — no session cookie");

  await page.context().addCookies([
    {
      name: "taskflow_session",
      value: match[1],
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
    },
  ]);
  return match[1];
}

async function getSessionCookie(page: import("@playwright/test").Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "taskflow_session")?.value ?? "";
}

async function apiCreateTask(cookie: string, title: string) {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `taskflow_session=${cookie}`,
    },
    body: JSON.stringify({
      title,
      description: "",
      status: "todo",
      priority: "medium",
      due_date: null,
    }),
  });
  return res.json() as Promise<{ id: string; title: string }>;
}

async function apiPatchTask(
  cookie: string,
  id: string,
  patch: Record<string, unknown>,
) {
  await fetch(`${API_BASE}/tasks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `taskflow_session=${cookie}`,
    },
    body: JSON.stringify(patch),
  });
}

async function apiDeleteTask(cookie: string, id: string) {
  await fetch(`${API_BASE}/tasks/${id}`, {
    method: "DELETE",
    headers: { Cookie: `taskflow_session=${cookie}` },
  });
}

// ─── Two-tab SSE live-update suite ────────────────────────────────────────────

test.describe("SSE live updates — two tabs in the same session", () => {
  /**
   * Both page A and page B share the SAME browser context (same cookies / same
   * user session).  Events originate from a direct API call (simulating "another
   * tab"), and the observer page (B) must reflect them within ~3 s purely via
   * the SSE-driven cache invalidation — with no manual user interaction on B.
   */
  test("(a) create in A → row appears in B within 3s", async ({ browser }) => {
    // Single context so both pages share the same session cookie jar.
    const ctx = await browser.newContext();
    const pageA = await ctx.newPage();
    const pageB = await ctx.newPage();

    try {
      // Authenticate both pages
      await loginViaAPI(pageA);
      // pageB is in the same context — cookies are already shared

      // Open both pages before we take any actions
      await pageA.goto(BASE);
      await pageB.goto(BASE);

      // Wait for both to be loaded (title visible)
      await expect(pageA.locator("h1", { hasText: "Tasks" })).toBeVisible({
        timeout: 10_000,
      });
      await expect(pageB.locator("h1", { hasText: "Tasks" })).toBeVisible({
        timeout: 10_000,
      });

      // Give both pages time to establish SSE connections (useEffect fires after paint)
      await pageA.waitForTimeout(1500);
      await pageB.waitForTimeout(500);

      const cookie = await getSessionCookie(pageA);
      const title = `SSE-Create-${Date.now()}`;

      // Act on A: create task via direct API (replicates what page A's UI would do)
      await apiCreateTask(cookie, title);

      // Assert on B: row appears without any interaction
      await expect(pageB.locator("span", { hasText: title })).toBeVisible({
        timeout: 8_000,
      });

      console.log("[SSE two-tab] (a) create: task appeared on page B via SSE");
    } finally {
      await ctx.close();
    }
  });

  test("(b) complete in A → line-through appears in B within 3s", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const pageA = await ctx.newPage();
    const pageB = await ctx.newPage();

    try {
      await loginViaAPI(pageA);

      const cookie = await getSessionCookie(pageA);
      const title = `SSE-Complete-${Date.now()}`;

      // Seed the task before loading the pages so it's already visible
      const task = await apiCreateTask(cookie, title);

      await pageA.goto(BASE);
      await pageB.goto(BASE);

      await expect(pageA.locator("span", { hasText: title })).toBeVisible({
        timeout: 10_000,
      });
      await expect(pageB.locator("span", { hasText: title })).toBeVisible({
        timeout: 10_000,
      });

      // Give pages time to establish SSE connections after initial render
      await pageA.waitForTimeout(1500);
      await pageB.waitForTimeout(500);

      // Act on A: mark task as done via direct API
      await apiPatchTask(cookie, task.id, { status: "done" });

      // Assert on B: title gets line-through class
      await expect(pageB.locator("span", { hasText: title })).toHaveClass(
        /line-through/,
        { timeout: 8_000 },
      );

      console.log(
        "[SSE two-tab] (b) complete: line-through appeared on page B via SSE",
      );
    } finally {
      await ctx.close();
    }
  });

  test("(c) delete in A → row disappears from B within 3s", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const pageA = await ctx.newPage();
    const pageB = await ctx.newPage();

    try {
      await loginViaAPI(pageA);

      const cookie = await getSessionCookie(pageA);
      const title = `SSE-Delete-${Date.now()}`;

      const task = await apiCreateTask(cookie, title);

      await pageA.goto(BASE);
      await pageB.goto(BASE);

      await expect(pageA.locator("span", { hasText: title })).toBeVisible({
        timeout: 10_000,
      });
      await expect(pageB.locator("span", { hasText: title })).toBeVisible({
        timeout: 10_000,
      });

      // Give pages time to establish SSE connections after initial render
      await pageA.waitForTimeout(1500);
      await pageB.waitForTimeout(500);

      // Act on A: delete task via direct API
      await apiDeleteTask(cookie, task.id);

      // Assert on B: row disappears
      await expect(pageB.locator("span", { hasText: title })).not.toBeVisible({
        timeout: 8_000,
      });

      console.log("[SSE two-tab] (c) delete: row removed on page B via SSE");
    } finally {
      await ctx.close();
    }
  });
});
