import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const TEST_EMAIL = `attach-test-${Date.now()}@test.com`;
const TEST_PASSWORD = "Test1234!";
const BASE = "http://localhost:3001";
const API_BASE = "http://localhost:8082";

// Tiny 1x1 PNG (base64)
const TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginViaAPI(page: import("@playwright/test").Page) {
  // Sign up
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

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe("Attachments", () => {
  test("upload, preview, download link, delete and activity log", async ({ page }) => {
    // 1. Auth
    await loginViaAPI(page);
    const cookie = await getSessionCookie(page);

    // 2. Create a task via API
    const taskTitle = `AttachTest-${Date.now()}`;
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

    // 3. Write the tiny PNG to a temp file
    const tmpFile = path.join(os.tmpdir(), `test-attach-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, Buffer.from(TINY_PNG_B64, "base64"));

    // 4. Navigate to app
    await page.goto(`${BASE}/`);

    // 5. Wait for the task row and open the panel
    const titleEl = page.locator("span", { hasText: taskTitle });
    await expect(titleEl).toBeVisible({ timeout: 12_000 });
    await titleEl.click();

    // 6. Wait for panel to open
    await expect(page.locator('button[aria-label="Close panel"]')).toBeVisible({ timeout: 5_000 });

    // 7. Wait for the Attachments section to be visible
    await expect(page.locator("text=Attachments").first()).toBeVisible({ timeout: 8_000 });

    // 8. Upload the PNG via the hidden file input
    const fileInput = page.locator('input[type="file"][accept]');
    await fileInput.setInputFiles(tmpFile);

    // 9. Wait for the attachment item to appear (thumbnail img)
    const attachmentThumb = page.locator(`img[src*="/api/attachments/"]`);
    await expect(attachmentThumb).toBeVisible({ timeout: 10_000 });

    // 10. Verify activity log shows "attached"
    // Scroll down to activity section
    const activitySection = page.locator("text=Activity").first();
    await expect(activitySection).toBeVisible({ timeout: 5_000 });

    // Wait for attachment_added activity entry (contains "attached" keyword)
    await expect(page.locator("text=/attached/i").first()).toBeVisible({ timeout: 10_000 });

    // 11. Verify download link has correct href
    const downloadLink = page.locator('a[aria-label^="Download"]');
    await expect(downloadLink).toBeVisible({ timeout: 5_000 });
    const href = await downloadLink.getAttribute("href");
    expect(href).toMatch(/\/api\/attachments\//);
    const downloadAttr = await downloadLink.getAttribute("download");
    expect(downloadAttr).toBeTruthy();

    // 12. Delete the attachment: hover attachment row to reveal actions, click delete
    // The attachment item contains the thumbnail; hover its parent container to trigger visibility
    // Scroll into view
    await attachmentThumb.scrollIntoViewIfNeeded();
    // Find the delete button by aria-label pattern that includes filename (not "Delete task")
    // The filename ends in .png so we look for button whose aria-label is NOT "Delete task"
    const deleteBtn = page.locator('button[aria-label$=".png"]');
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm strip should appear
    const confirmBtn = page.locator('button', { hasText: "Confirm" });
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();

    // 13. Attachment item should be gone
    await expect(attachmentThumb).not.toBeVisible({ timeout: 8_000 });

    // 14. "No attachments." empty state should appear
    await expect(page.locator("text=No attachments.")).toBeVisible({ timeout: 5_000 });

    // 15. Activity log should show attachment removed
    await expect(page.locator("text=/detached|removed|unattached/i").first()).toBeVisible({ timeout: 10_000 });

    // 16. Screenshot
    await page.screenshot({ path: "/tmp/task8-attachments.png", fullPage: false });

    console.log("[Attachments] All assertions passed. Screenshot: /tmp/task8-attachments.png");

    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  });
});
