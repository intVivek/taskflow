import { test, expect } from "@playwright/test";

const TEST_EMAIL = "playwright@test.com";
const TEST_PASSWORD = "Test1234!";
const BASE = "http://localhost:3001";
const API_BASE = "http://localhost:8081";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Register user (ignores conflict) then logs in via API and injects cookies.
 * Returns an object with the cookie string for context injection.
 */
async function loginViaAPI(page: import("@playwright/test").Page) {
  // Try signup first (idempotent - ignore 409)
  await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  // Login
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
}

async function createTask(
  cookie: string,
  title: string,
): Promise<{ id: string; title: string }> {
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
  return res.json();
}

async function getSessionCookie(page: import("@playwright/test").Page) {
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "taskflow_session");
  return session?.value ?? "";
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe("Optimistic UI", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test("(a) optimistic toggle: line-through appears within 300ms despite 1s server delay", async ({
    page,
  }) => {
    // Seed tasks via API
    const cookie = await getSessionCookie(page);
    const task = await createTask(cookie, `OptimisticToggle-${Date.now()}`);

    // Navigate to tasks page
    await page.goto(`${BASE}/`);

    // Wait for the task row to appear
    const titleEl = page.locator("span", { hasText: task.title });
    await expect(titleEl).toBeVisible({ timeout: 10_000 });

    // Intercept PATCH with 1000ms artificial delay
    await page.route(`**/api/tasks/${task.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // Record time, click checkbox
    const checkbox = page.locator(`button[aria-label="Mark complete"]`).first();
    await checkbox.waitFor({ state: "visible" });

    const start = Date.now();
    await checkbox.click();

    // Assert line-through applied within 300ms (optimistic)
    await expect(titleEl).toHaveClass(/line-through/, { timeout: 300 });
    const elapsed = Date.now() - start;

    console.log(`[Optimistic toggle] line-through applied in ${elapsed}ms (expected < 300ms)`);
    expect(elapsed).toBeLessThan(300);
  });

  test("(b) rollback: toggle reverts and toast appears when server fails", async ({
    page,
  }) => {
    const cookie = await getSessionCookie(page);
    const task = await createTask(cookie, `OptimisticRollback-${Date.now()}`);

    await page.goto(`${BASE}/`);

    const titleEl = page.locator("span", { hasText: task.title });
    await expect(titleEl).toBeVisible({ timeout: 10_000 });

    // Intercept PATCH and abort it
    await page.route(`**/api/tasks/${task.id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });

    const checkbox = page.locator(`button[aria-label="Mark complete"]`).first();
    await checkbox.waitFor({ state: "visible" });
    await checkbox.click();

    // Optimistic: line-through appears quickly
    await expect(titleEl).toHaveClass(/line-through/, { timeout: 300 });

    // Then rollback: line-through removed within ~2s
    await expect(titleEl).not.toHaveClass(/line-through/, { timeout: 3000 });

    // Toast appears — sonner renders text in [data-title] within [data-sonner-toast].
    // When a network abort occurs the error message is "Failed to fetch" (TypeError).
    // Our onError calls toast.error(err.message ?? "Couldn't save — change rolled back"),
    // so the toast text may be "Failed to fetch" or the fallback message.
    const toastEl = page.locator('[data-sonner-toast]');
    await expect(toastEl).toBeVisible({ timeout: 5000 });

    console.log("[Rollback] Optimistic update reverted and toast shown");
  });

  test("(c) delete optimistic: row disappears immediately with delayed DELETE", async ({
    page,
  }) => {
    const cookie = await getSessionCookie(page);
    const task = await createTask(cookie, `OptimisticDelete-${Date.now()}`);

    await page.goto(`${BASE}/`);

    const titleEl = page.locator("span", { hasText: task.title });
    await expect(titleEl).toBeVisible({ timeout: 10_000 });

    // Intercept DELETE with 1000ms delay
    await page.route(`**/api/tasks/${task.id}`, async (route) => {
      if (route.request().method() === "DELETE") {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // Find the row by title then navigate to the trash button
    const row = page
      .locator("div.group")
      .filter({ has: page.locator("span", { hasText: task.title }) });

    const trashBtn = row.locator('button[aria-label="Delete task"]');
    await trashBtn.waitFor({ state: "visible" });
    await trashBtn.click();

    // Confirm button appears
    const confirmBtn = row.locator("button", { hasText: "Confirm" });
    await expect(confirmBtn).toBeVisible({ timeout: 2000 });

    const start = Date.now();
    await confirmBtn.click();

    // Row should disappear optimistically before the 1s server response
    await expect(titleEl).not.toBeVisible({ timeout: 500 });
    const elapsed = Date.now() - start;

    console.log(`[Delete optimistic] row disappeared in ${elapsed}ms (expected < 500ms)`);
    expect(elapsed).toBeLessThan(500);
  });
});
