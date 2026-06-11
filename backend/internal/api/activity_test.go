package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

// activityEntry is the wire shape for a single activity log entry.
type activityEntry struct {
	ID         int64            `json:"id"`
	Action     string           `json:"action"`
	ActorEmail *string          `json:"actor_email"`
	Changes    *json.RawMessage `json:"changes"`
	CreatedAt  string           `json:"created_at"`
}

type activityResp struct {
	Data []activityEntry `json:"data"`
}

func getActivity(t *testing.T, taskID string, c *http.Cookie) (int, activityResp) {
	t.Helper()
	rec := doReq(t, "GET", "/tasks/"+taskID+"/activity", nil, c)
	if rec.Code != http.StatusOK {
		return rec.Code, activityResp{}
	}
	var resp activityResp
	decode(t, rec, &resp)
	return rec.Code, resp
}

// TestActivityRecorded: create task, patch with changes, patch with no-op,
// then assert 2 entries (newest first): [0]=updated with title+status changes,
// [1]=created with null changes; actor_email equals signup email.
func TestActivityRecorded(t *testing.T) {
	resetDB(t)
	email := "actoruser@example.com"
	c := signup(t, email)

	tk := createTask(t, c, map[string]any{
		"title":  "Original Title",
		"status": "todo",
	})

	// Meaningful patch: change title and status.
	rec := doReq(t, "PATCH", "/tasks/"+tk.ID, map[string]any{
		"title":  "Updated Title",
		"status": "in_progress",
	}, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch: got %d: %s", rec.Code, rec.Body.String())
	}

	// No-op patch: send empty body — must NOT add an activity entry.
	rec = doReq(t, "PATCH", "/tasks/"+tk.ID, map[string]any{}, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("no-op patch: got %d: %s", rec.Code, rec.Body.String())
	}

	code, resp := getActivity(t, tk.ID, c)
	if code != http.StatusOK {
		t.Fatalf("GET activity: got %d", code)
	}

	if len(resp.Data) != 2 {
		t.Fatalf("expected 2 activity entries, got %d: %+v", len(resp.Data), resp.Data)
	}

	// Newest first: [0] should be 'updated'.
	updated := resp.Data[0]
	if updated.Action != "updated" {
		t.Fatalf("entry[0].action: want 'updated', got %q", updated.Action)
	}
	if updated.ActorEmail == nil || *updated.ActorEmail != email {
		t.Fatalf("entry[0].actor_email: want %q, got %v", email, updated.ActorEmail)
	}
	if updated.Changes == nil {
		t.Fatal("entry[0].changes: expected non-null changes for meaningful patch")
	}

	// Decode changes and assert title and status diffs.
	var changes map[string]map[string]any
	if err := json.Unmarshal(*updated.Changes, &changes); err != nil {
		t.Fatalf("decode changes: %v", err)
	}
	titleDiff, ok := changes["title"]
	if !ok {
		t.Fatalf("changes missing 'title' key; got %+v", changes)
	}
	if titleDiff["from"] != "Original Title" {
		t.Fatalf("title.from: want 'Original Title', got %v", titleDiff["from"])
	}
	if titleDiff["to"] != "Updated Title" {
		t.Fatalf("title.to: want 'Updated Title', got %v", titleDiff["to"])
	}
	statusDiff, ok := changes["status"]
	if !ok {
		t.Fatalf("changes missing 'status' key; got %+v", changes)
	}
	if statusDiff["from"] != "todo" {
		t.Fatalf("status.from: want 'todo', got %v", statusDiff["from"])
	}
	if statusDiff["to"] != "in_progress" {
		t.Fatalf("status.to: want 'in_progress', got %v", statusDiff["to"])
	}

	// [1] should be 'created' with null changes.
	created := resp.Data[1]
	if created.Action != "created" {
		t.Fatalf("entry[1].action: want 'created', got %q", created.Action)
	}
	if created.Changes != nil {
		t.Fatalf("entry[1].changes: expected null for created, got %s", string(*created.Changes))
	}
	if created.ActorEmail == nil || *created.ActorEmail != email {
		t.Fatalf("entry[1].actor_email: want %q, got %v", email, created.ActorEmail)
	}
}

// TestActivityOwnership: intruder GET → 404.
func TestActivityOwnership(t *testing.T) {
	resetDB(t)
	owner := signup(t, "actowner@example.com")
	intruder := signup(t, "actintruder@example.com")

	tk := createTask(t, owner, map[string]any{"title": "private task"})

	rec := doReq(t, "GET", "/tasks/"+tk.ID+"/activity", nil, intruder)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("intruder GET activity: want 404, got %d", rec.Code)
	}
}

// TestActivityEmptyForNewTaskAfterOnlyCreate: just 1 entry (created).
func TestActivityEmptyForNewTaskAfterOnlyCreate(t *testing.T) {
	resetDB(t)
	c := signup(t, "onlycreate@example.com")

	tk := createTask(t, c, map[string]any{"title": "Just Created"})

	code, resp := getActivity(t, tk.ID, c)
	if code != http.StatusOK {
		t.Fatalf("GET activity: got %d", code)
	}
	if len(resp.Data) != 1 {
		t.Fatalf("expected 1 activity entry (created), got %d", len(resp.Data))
	}
	if resp.Data[0].Action != "created" {
		t.Fatalf("expected action 'created', got %q", resp.Data[0].Action)
	}
}

// TestActivityDueDateDiff: patch due_date null→"2026-08-01" →
// changes.due_date.from null, .to "2026-08-01".
func TestActivityDueDateDiff(t *testing.T) {
	resetDB(t)
	c := signup(t, "duedatediff@example.com")

	// Create task with no due_date.
	tk := createTask(t, c, map[string]any{"title": "Due Date Task"})

	// Patch to set a due_date.
	rec := doReq(t, "PATCH", "/tasks/"+tk.ID, map[string]any{
		"due_date": "2026-08-01",
	}, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch due_date: got %d: %s", rec.Code, rec.Body.String())
	}

	_, resp := getActivity(t, tk.ID, c)
	if len(resp.Data) < 1 {
		t.Fatal("expected at least 1 activity entry")
	}

	// Newest entry should be 'updated' with due_date diff.
	updated := resp.Data[0]
	if updated.Action != "updated" {
		t.Fatalf("expected action 'updated', got %q", updated.Action)
	}
	if updated.Changes == nil {
		t.Fatal("expected non-null changes for due_date patch")
	}

	var changes map[string]map[string]any
	if err := json.Unmarshal(*updated.Changes, &changes); err != nil {
		t.Fatalf("decode changes: %v", err)
	}

	dueDiff, ok := changes["due_date"]
	if !ok {
		t.Fatalf("changes missing 'due_date' key; got %+v", changes)
	}
	// from should be null (Go nil decodes as nil in map).
	if dueDiff["from"] != nil {
		t.Fatalf("due_date.from: want nil, got %v", dueDiff["from"])
	}
	if dueDiff["to"] != "2026-08-01" {
		t.Fatalf("due_date.to: want '2026-08-01', got %v", dueDiff["to"])
	}
}
