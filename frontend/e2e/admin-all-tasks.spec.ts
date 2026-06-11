import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

const TS = Date.now();
const USER_A_EMAIL = `task5-userA-${TS}@test.com`;
const USER_B_EMAIL = `task5-userB-${TS}@test.com`;
const PASSWORD = "Test1234!";
const BASE = "http://localhost:3001";
const API_BASE = "http://localhost:8082";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function signupAndLogin(email: string, password: string): Promise<string> {
  // Signup
  const su = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!su.ok) {
    const txt = await su.text();
    throw new Error(`Signup failed for ${email}: ${su.status} ${txt}`);
  }
  // Login
  const lr = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = lr.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/taskflow_session=([^;]+)/);
  if (!m) throw new Error(`Login failed for ${email} — no session cookie`);
  return m[1];
}

async function createTask(cookie: string, title: string) {
  const r = await fetch(`${API_BASE}/tasks`, {
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
  const t = await r.json();
  if (!t.id) throw new Error(`createTask failed: ${JSON.stringify(t)}`);
  return t;
}

function promoteToAdmin(email: string) {
  execSync(
    `docker compose exec -T db psql -U postgres -d taskflow -c "UPDATE users SET role='admin' WHERE email='${email}'"`,
    { cwd: "/Users/viveksrivastava/rival" }
  );
}

async function setSessionCookie(
  page: import("@playwright/test").Page,
  cookie: string
) {
  await page.context().addCookies([
    {
      name: "taskflow_session",
      value: cookie,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
    },
  ]);
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

test.describe("Admin All-Tasks View (Task 5)", () => {
  let cookieA: string;
  let cookieB: string;
  let taskA1Title: string;
  let taskA2Title: string;
  let bTaskTitle: string;

  test.beforeAll(async () => {
    // Create two users + tasks
    cookieA = await signupAndLogin(USER_A_EMAIL, PASSWORD);
    cookieB = await signupAndLogin(USER_B_EMAIL, PASSWORD);

    taskA1Title = `UserA-Task1-${TS}`;
    taskA2Title = `UserA-Task2-${TS}`;
    bTaskTitle = `UserB-Task-${TS}`;

    await createTask(cookieA, taskA1Title);
    await createTask(cookieA, taskA2Title);
    await createTask(cookieB, bTaskTitle);

    // Promote B to admin; re-login to get a new JWT with baked-in role
    promoteToAdmin(USER_B_EMAIL);

    // Re-login B
    const lr = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER_B_EMAIL, password: PASSWORD }),
    });
    const setCookie = lr.headers.get("set-cookie") ?? "";
    const m = setCookie.match(/taskflow_session=([^;]+)/);
    if (!m) throw new Error("Re-login for B failed");
    cookieB = m[1];
  });

  test("user A (plain user) sees no All tasks toggle", async ({ page }) => {
    await setSessionCookie(page, cookieA);
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");

    // Toggle button should not exist
    const toggle = page.locator('button[role="switch"][aria-label="All tasks"]');
    await expect(toggle).not.toBeVisible();
  });

  test("admin B sees toggle, toggle adds scope=all to URL, A's tasks visible with owner chips", async ({ page }) => {
    await setSessionCookie(page, cookieB);
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");

    // Toggle must be visible for admin
    const toggle = page.locator('button[role="switch"][aria-label="All tasks"]');
    await expect(toggle).toBeVisible({ timeout: 8_000 });
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Click toggle — URL should gain scope=all
    await toggle.click();
    await expect(page).toHaveURL(/scope=all/, { timeout: 5_000 });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    // User A's tasks should appear
    await expect(page.locator(`span:text("${taskA1Title}")`)).toBeVisible({
      timeout: 8_000,
    });

    // Owner chips must be visible (email shown as title attr)
    const ownerChips = page.locator(`span[title="${USER_A_EMAIL}"]`);
    await expect(ownerChips.first()).toBeVisible({ timeout: 5_000 });

    // Screenshot
    await page.screenshot({ path: "/tmp/task5-admin.png", fullPage: false });
    console.log("[Admin All-Tasks] Screenshot saved to /tmp/task5-admin.png");
  });

  test("foreign task rows lack edit/delete buttons and checkbox is disabled", async ({ page }) => {
    await setSessionCookie(page, cookieB);
    await page.goto(`${BASE}?scope=all`);
    await page.waitForLoadState("networkidle");

    // Find A's task row
    const taskRow = page.locator(`div[aria-label="Open task: ${taskA1Title}"]`);
    await expect(taskRow).toBeVisible({ timeout: 8_000 });

    // Edit button should NOT be visible inside that row
    const editBtn = taskRow.locator('button[aria-label="Edit task"]');
    await expect(editBtn).not.toBeVisible();

    // Checkbox button should be disabled / aria-disabled
    const checkbox = taskRow.locator('button[aria-disabled="true"]');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toHaveAttribute("title", "View only — not your task");
  });

  test("B's own tasks in scope=all are still editable", async ({ page }) => {
    await setSessionCookie(page, cookieB);
    await page.goto(`${BASE}?scope=all`);
    await page.waitForLoadState("networkidle");

    const taskRow = page.locator(`div[aria-label="Open task: ${bTaskTitle}"]`);
    await expect(taskRow).toBeVisible({ timeout: 8_000 });

    // Hover to reveal actions
    await taskRow.hover();

    // Edit button should be visible
    const editBtn = taskRow.locator('button[aria-label="Edit task"]');
    await expect(editBtn).toBeVisible({ timeout: 3_000 });
  });

  test("panel of foreign task shows owner line, hides footer, shows activity", async ({ page }) => {
    await setSessionCookie(page, cookieB);
    await page.goto(`${BASE}?scope=all`);
    await page.waitForLoadState("networkidle");

    // Click on A's task to open panel
    const taskRow = page.locator(`div[aria-label="Open task: ${taskA1Title}"]`);
    await taskRow.click();

    // Wait for panel
    await expect(
      page.locator('button[aria-label="Close panel"]')
    ).toBeVisible({ timeout: 5_000 });

    // Owner line must be visible
    await expect(page.locator("text=Owner")).toBeVisible({ timeout: 5_000 });

    // Footer Edit button should NOT exist (footer entirely hidden for foreign tasks)
    const footerEdit = page.locator(
      'div.shrink-0.border-t button:has-text("Edit")'
    );
    await expect(footerEdit).not.toBeVisible();

    // Activity section visible
    await expect(page.locator("text=Activity").first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test("toggle off -> only B's tasks shown, A's tasks disappear", async ({ page }) => {
    await setSessionCookie(page, cookieB);
    await page.goto(`${BASE}?scope=all`);
    await page.waitForLoadState("networkidle");

    // Verify A's tasks are visible
    await expect(page.locator(`span:text("${taskA1Title}")`)).toBeVisible({
      timeout: 8_000,
    });

    const toggle = page.locator('button[role="switch"][aria-label="All tasks"]');
    await expect(toggle).toBeVisible({ timeout: 8_000 });

    // Toggle off
    await toggle.click();
    await expect(page).not.toHaveURL(/scope=all/, { timeout: 5_000 });

    // A's tasks should no longer appear
    await expect(
      page.locator(`span:text("${taskA1Title}")`)
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("non-admin forcing ?scope=all gets error state (403)", async ({ page }) => {
    // Use user A's session with scope=all — should get 403 → ErrorState
    await setSessionCookie(page, cookieA);
    await page.goto(`${BASE}?scope=all`);
    await page.waitForLoadState("networkidle");

    // ErrorState renders "Something went wrong" or the 403 message
    await expect(
      page.locator("text=/admin access required|Something went wrong/i").first()
    ).toBeVisible({ timeout: 8_000 });

    // Toggle must NOT be visible for user A
    const toggle = page.locator('button[role="switch"][aria-label="All tasks"]');
    await expect(toggle).not.toBeVisible();
  });
});
