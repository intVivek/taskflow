import { test, expect } from "@playwright/test";

const TEST_EMAIL = `activity-test-${Date.now()}@test.com`;
const TEST_PASSWORD = "Test1234!";
const BASE = "http://localhost:3001";
const API_BASE = "http://localhost:8082";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginViaAPI(page: import("@playwright/test").Page) {
  // Sign up (fresh user)
  const signupRes = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!signupRes.ok) {
    const body = await signupRes.text();
    throw new Error(`Signup failed (${signupRes.status}): ${body}`);
  }

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

  return match[1];
}

async function getSessionCookie(page: import("@playwright/test").Page) {
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "taskflow_session");
  return session?.value ?? "";
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe("Activity Timeline", () => {
  test("shows activity log: created, renamed, status change — newest first", async ({ page }) => {
    // 1. Fresh user sign up + login
    await loginViaAPI(page);
    const cookie = await getSessionCookie(page);

    // 2. Create a task via API
    const taskTitle = `ActivityTest-${Date.now()}`;
    const createRes = await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `taskflow_session=${cookie}`,
      },
      body: JSON.stringify({
        title: taskTitle,
        description: "",
        status: "todo",
        priority: "medium",
        due_date: null,
      }),
    });
    const task = await createRes.json();
    expect(task.id).toBeTruthy();

    // 3. Edit title and status via API (PATCH)
    const updatedTitle = `${taskTitle}-renamed`;
    const patchRes = await fetch(`${API_BASE}/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `taskflow_session=${cookie}`,
      },
      body: JSON.stringify({
        title: updatedTitle,
        status: "in_progress",
      }),
    });
    expect(patchRes.ok).toBe(true);

    // 4. Navigate to app
    await page.goto(`${BASE}/`);

    // 5. Wait for the task row (use the updated title)
    const titleEl = page.locator("span", { hasText: updatedTitle });
    await expect(titleEl).toBeVisible({ timeout: 12_000 });

    // 6. Click the task row to open the panel
    await titleEl.click();

    // 7. Wait for the panel to open (close button visible)
    await expect(page.locator('button[aria-label="Close panel"]')).toBeVisible({
      timeout: 5_000,
    });

    // 8. Wait for activity section heading
    const activityHeading = page.locator("text=Activity").first();
    await expect(activityHeading).toBeVisible({ timeout: 8_000 });

    // 9. Wait for activity entries to load (no more skeleton)
    // The "created this task" entry must appear
    await expect(page.locator("text=created this task")).toBeVisible({ timeout: 8_000 });

    // 10. Assert "moved from To do to In progress" is present
    await expect(page.locator("text=moved from To do to In progress")).toBeVisible({
      timeout: 5_000,
    });

    // 11. Assert renamed sentence is present
    // "renamed "ActivityTest-..." to "ActivityTest-...-renamed""
    const renamedLocator = page.locator(`text=/renamed/`);
    await expect(renamedLocator.first()).toBeVisible({ timeout: 5_000 });

    // 12. Verify newest-first order: the rename/move entries should appear ABOVE "created this task"
    // We get bounding boxes for the elements
    const createdEl = page.locator("text=created this task");
    const movedEl = page.locator("text=moved from To do to In progress");

    const createdBox = await createdEl.boundingBox();
    const movedBox = await movedEl.boundingBox();

    expect(createdBox).not.toBeNull();
    expect(movedBox).not.toBeNull();

    // "moved" (newer) should be above (smaller Y) "created" (older)
    expect(movedBox!.y).toBeLessThan(createdBox!.y);

    // 13. Screenshot
    await page.screenshot({ path: "/tmp/task3-activity.png", fullPage: false });

    console.log("[Activity Timeline] All assertions passed. Screenshot saved to /tmp/task3-activity.png");
  });
});
