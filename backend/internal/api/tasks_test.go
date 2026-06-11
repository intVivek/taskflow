package api_test

import (
	"net/http"
	"testing"
)

type taskResp struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	DueDate     *string `json:"due_date"`
}

func createTask(t *testing.T, c *http.Cookie, body map[string]any) taskResp {
	t.Helper()
	rec := doReq(t, "POST", "/tasks", body, c)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create task: got %d: %s", rec.Code, rec.Body.String())
	}
	var tk taskResp
	decode(t, rec, &tk)
	return tk
}

func TestTaskCRUD(t *testing.T) {
	resetDB(t)
	c := signup(t, "crud@example.com")

	tk := createTask(t, c, map[string]any{
		"title": "Write report", "description": "Q2 numbers",
		"priority": "high", "due_date": "2026-07-01",
	})
	if tk.Status != "todo" || tk.Priority != "high" || tk.DueDate == nil || *tk.DueDate != "2026-07-01" {
		t.Fatalf("unexpected task: %+v", tk)
	}

	rec := doReq(t, "GET", "/tasks/"+tk.ID, nil, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("get: %d", rec.Code)
	}

	rec = doReq(t, "PATCH", "/tasks/"+tk.ID, map[string]any{"status": "done", "title": "Write report v2"}, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch: %d: %s", rec.Code, rec.Body.String())
	}
	var updated taskResp
	decode(t, rec, &updated)
	if updated.Status != "done" || updated.Title != "Write report v2" {
		t.Fatalf("patch not applied: %+v", updated)
	}
	if updated.DueDate == nil || *updated.DueDate != "2026-07-01" {
		t.Fatal("patch must not clobber unspecified fields")
	}

	rec = doReq(t, "PATCH", "/tasks/"+tk.ID, map[string]any{"due_date": nil}, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch null due_date: %d", rec.Code)
	}
	decode(t, rec, &updated)
	if updated.DueDate != nil {
		t.Fatal("explicit null must clear due_date")
	}

	rec = doReq(t, "DELETE", "/tasks/"+tk.ID, nil, c)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rec.Code)
	}
	rec = doReq(t, "GET", "/tasks/"+tk.ID, nil, c)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: got %d, want 404", rec.Code)
	}
}

func TestTaskValidation(t *testing.T) {
	resetDB(t)
	c := signup(t, "val@example.com")

	rec := doReq(t, "POST", "/tasks", map[string]any{"description": "no title"}, c)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("missing title: got %d, want 422", rec.Code)
	}
	var e struct {
		Error struct {
			Fields map[string]string `json:"fields"`
		} `json:"error"`
	}
	decode(t, rec, &e)
	if e.Error.Fields["title"] == "" {
		t.Fatalf("want title field error, got %+v", e.Error.Fields)
	}

	cases := []struct {
		field string
		body  map[string]any
	}{
		{"status", map[string]any{"title": "x", "status": "bogus"}},
		{"priority", map[string]any{"title": "x", "priority": "urgent"}},
		{"due_date", map[string]any{"title": "x", "due_date": "07/01/2026"}},
	}
	for _, tc := range cases {
		rec := doReq(t, "POST", "/tasks", tc.body, c)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s: got %d, want 422", tc.field, rec.Code)
		}
	}
}

func TestTaskOwnership(t *testing.T) {
	resetDB(t)
	owner := signup(t, "owner@example.com")
	intruder := signup(t, "intruder@example.com")

	tk := createTask(t, owner, map[string]any{"title": "private"})

	if rec := doReq(t, "GET", "/tasks/"+tk.ID, nil, intruder); rec.Code != http.StatusNotFound {
		t.Fatalf("intruder GET: got %d, want 404", rec.Code)
	}
	if rec := doReq(t, "PATCH", "/tasks/"+tk.ID, map[string]any{"title": "hacked"}, intruder); rec.Code != http.StatusNotFound {
		t.Fatalf("intruder PATCH: got %d, want 404", rec.Code)
	}
	if rec := doReq(t, "DELETE", "/tasks/"+tk.ID, nil, intruder); rec.Code != http.StatusNotFound {
		t.Fatalf("intruder DELETE: got %d, want 404", rec.Code)
	}
	if rec := doReq(t, "GET", "/tasks/"+tk.ID, nil, owner); rec.Code != http.StatusOK {
		t.Fatalf("owner GET after intrusion attempts: got %d, want 200", rec.Code)
	}
}

func TestTasksRequireAuth(t *testing.T) {
	if rec := doReq(t, "GET", "/tasks", nil, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
	if rec := doReq(t, "POST", "/tasks", map[string]any{"title": "x"}, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}
