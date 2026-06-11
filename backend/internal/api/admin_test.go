package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

// adminTaskResp extends taskResp to capture the optional owner_email field.
type adminTaskResp struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Status     string  `json:"status"`
	OwnerEmail *string `json:"owner_email"`
}

type adminListResp struct {
	Data []adminTaskResp `json:"data"`
	Meta struct {
		Page       int   `json:"page"`
		Limit      int   `json:"limit"`
		Total      int64 `json:"total"`
		TotalPages int   `json:"total_pages"`
	} `json:"meta"`
}

// promoteToAdmin sets role='admin' in the DB for the given email, then
// re-logs in to get a fresh JWT (role is baked at mint time) and returns
// the new session cookie.
func promoteToAdmin(t *testing.T, email string) *http.Cookie {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		"UPDATE users SET role='admin' WHERE email=$1", email)
	if err != nil {
		t.Fatalf("promoteToAdmin: %v", err)
	}
	rec := doReq(t, "POST", "/auth/login", map[string]string{
		"email": email, "password": "password123",
	}, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("promoteToAdmin re-login: got %d: %s", rec.Code, rec.Body.String())
	}
	return sessionCookie(t, rec)
}

// TestAdminScopeAll: two users with tasks; promote one to admin; admin can
// list all tasks with ?scope=all, sees owner_email for each, and composable
// filters still work.
func TestAdminScopeAll(t *testing.T) {
	resetDB(t)

	// User A creates 2 tasks (todo + done).
	cookieA := signup(t, "admin_a@example.com")
	createTask(t, cookieA, map[string]any{"title": "A todo", "status": "todo"})
	createTask(t, cookieA, map[string]any{"title": "A done", "status": "done"})

	// User B creates 1 task (todo).
	cookieB := signup(t, "admin_b@example.com")
	createTask(t, cookieB, map[string]any{"title": "B todo", "status": "todo"})

	// Promote B to admin and re-login.
	adminCookieB := promoteToAdmin(t, "admin_b@example.com")

	// Admin list all — should see 3 tasks total.
	rec := doReq(t, "GET", "/tasks?scope=all", nil, adminCookieB)
	if rec.Code != http.StatusOK {
		t.Fatalf("scope=all: got %d: %s", rec.Code, rec.Body.String())
	}
	var lr adminListResp
	decode(t, rec, &lr)
	if lr.Meta.Total != 3 {
		t.Fatalf("scope=all total: want 3, got %d", lr.Meta.Total)
	}

	// All items must have a non-nil owner_email.
	for i, item := range lr.Data {
		if item.OwnerEmail == nil {
			t.Fatalf("item[%d] %q: owner_email is nil", i, item.Title)
		}
	}

	// Verify both email values appear.
	emails := map[string]bool{}
	for _, item := range lr.Data {
		emails[*item.OwnerEmail] = true
	}
	if !emails["admin_a@example.com"] {
		t.Fatalf("owner_email 'admin_a@example.com' not found in response; got %v", emails)
	}
	if !emails["admin_b@example.com"] {
		t.Fatalf("owner_email 'admin_b@example.com' not found in response; got %v", emails)
	}

	// Composable filter: ?scope=all&status=todo should narrow to 2 (A todo + B todo).
	rec2 := doReq(t, "GET", "/tasks?scope=all&status=todo", nil, adminCookieB)
	if rec2.Code != http.StatusOK {
		t.Fatalf("scope=all&status=todo: got %d: %s", rec2.Code, rec2.Body.String())
	}
	var lr2 adminListResp
	decode(t, rec2, &lr2)
	if lr2.Meta.Total != 2 {
		t.Fatalf("scope=all&status=todo total: want 2, got %d", lr2.Meta.Total)
	}
}

// TestScopeAllForbiddenForUser: a plain (non-admin) user gets 403 with
// code "forbidden" when using ?scope=all.
func TestScopeAllForbiddenForUser(t *testing.T) {
	resetDB(t)
	c := signup(t, "plain_user@example.com")
	rec := doReq(t, "GET", "/tasks?scope=all", nil, c)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("plain user scope=all: want 403, got %d", rec.Code)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	decode(t, rec, &body)
	if body.Error.Code != "forbidden" {
		t.Fatalf("error code: want 'forbidden', got %q", body.Error.Code)
	}
}

// TestScopeValidation: ?scope=bogus → 422 with a "scope" field error.
func TestScopeValidation(t *testing.T) {
	resetDB(t)
	c := signup(t, "scope_val@example.com")
	rec := doReq(t, "GET", "/tasks?scope=bogus", nil, c)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("scope=bogus: want 422, got %d", rec.Code)
	}
	var body struct {
		Error struct {
			Fields map[string]string `json:"fields"`
		} `json:"error"`
	}
	decode(t, rec, &body)
	if body.Error.Fields["scope"] == "" {
		t.Fatalf("want 'scope' field error, got %+v", body.Error.Fields)
	}
}

// TestAdminCanViewOthersTask: admin can GET /tasks/{id} for another user's
// task, and can also GET the activity log for it.
func TestAdminCanViewOthersTask(t *testing.T) {
	resetDB(t)

	// Owner creates a task.
	ownerCookie := signup(t, "task_owner@example.com")
	tk := createTask(t, ownerCookie, map[string]any{"title": "Owner Task"})

	// Promote admin.
	adminCookie := signup(t, "task_admin@example.com")
	adminCookie = promoteToAdmin(t, "task_admin@example.com")

	// Admin GET /tasks/{id} → 200.
	rec := doReq(t, "GET", "/tasks/"+tk.ID, nil, adminCookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin GET task: want 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Admin GET /tasks/{id}/activity → 200.
	rec = doReq(t, "GET", "/tasks/"+tk.ID+"/activity", nil, adminCookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("admin GET activity: want 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestAdminCannotModifyOthersTask: admin PATCH → 404, admin DELETE → 404.
func TestAdminCannotModifyOthersTask(t *testing.T) {
	resetDB(t)

	ownerCookie := signup(t, "mod_owner@example.com")
	tk := createTask(t, ownerCookie, map[string]any{"title": "Unmodifiable"})

	adminCookie := signup(t, "mod_admin@example.com")
	adminCookie = promoteToAdmin(t, "mod_admin@example.com")

	// Admin PATCH → 404 (not the task owner).
	rec := doReq(t, "PATCH", "/tasks/"+tk.ID, map[string]any{"title": "Hacked"}, adminCookie)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("admin PATCH others task: want 404, got %d", rec.Code)
	}

	// Admin DELETE → 404.
	rec = doReq(t, "DELETE", "/tasks/"+tk.ID, nil, adminCookie)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("admin DELETE others task: want 404, got %d", rec.Code)
	}
}

// TestOwnerEmailAbsentInOwnScope: plain user list (no scope) must NOT have
// "owner_email" keys in the response JSON.
func TestOwnerEmailAbsentInOwnScope(t *testing.T) {
	resetDB(t)
	c := signup(t, "no_email@example.com")
	createTask(t, c, map[string]any{"title": "my task"})

	rec := doReq(t, "GET", "/tasks", nil, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: got %d: %s", rec.Code, rec.Body.String())
	}

	// Unmarshal into generic structure to verify key absence.
	var raw struct {
		Data []json.RawMessage `json:"data"`
	}
	decode(t, rec, &raw)
	if len(raw.Data) == 0 {
		t.Fatal("expected at least one task")
	}
	for i, item := range raw.Data {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(item, &m); err != nil {
			t.Fatalf("decode item[%d]: %v", i, err)
		}
		if _, ok := m["owner_email"]; ok {
			t.Fatalf("item[%d] unexpectedly contains 'owner_email'", i)
		}
	}
}
