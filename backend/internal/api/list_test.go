package api_test

import (
	"fmt"
	"net/http"
	"testing"
)

type listResp struct {
	Data []taskResp `json:"data"`
	Meta struct {
		Page       int   `json:"page"`
		Limit      int   `json:"limit"`
		Total      int64 `json:"total"`
		TotalPages int   `json:"total_pages"`
	} `json:"meta"`
}

func listTasks(t *testing.T, c *http.Cookie, query string) listResp {
	t.Helper()
	rec := doReq(t, "GET", "/tasks"+query, nil, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("list %q: got %d: %s", query, rec.Code, rec.Body.String())
	}
	var lr listResp
	decode(t, rec, &lr)
	return lr
}

func titles(lr listResp) []string {
	out := make([]string, len(lr.Data))
	for i, tk := range lr.Data {
		out[i] = tk.Title
	}
	return out
}

func assertTitles(t *testing.T, got []string, want ...string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

// seedList creates a fixture:
//
//	alpha report  (todo,        high,   due 2026-07-03)
//	beta report   (in_progress, low,    due 2026-07-01)
//	gamma notes   (todo,        medium, due 2026-07-02)
//	delta notes   (done,        high,   no due date)
func seedList(t *testing.T) *http.Cookie {
	c := signup(t, "list@example.com")
	createTask(t, c, map[string]any{"title": "alpha report", "status": "todo", "priority": "high", "due_date": "2026-07-03"})
	createTask(t, c, map[string]any{"title": "beta report", "status": "in_progress", "priority": "low", "due_date": "2026-07-01"})
	createTask(t, c, map[string]any{"title": "gamma notes", "status": "todo", "priority": "medium", "due_date": "2026-07-02"})
	createTask(t, c, map[string]any{"title": "delta notes", "status": "done", "priority": "high"})
	return c
}

func TestListFilterByStatus(t *testing.T) {
	resetDB(t)
	c := seedList(t)
	lr := listTasks(t, c, "?status=todo&sort=due_date&order=asc")
	assertTitles(t, titles(lr), "gamma notes", "alpha report")
	if lr.Meta.Total != 2 {
		t.Fatalf("total = %d, want 2", lr.Meta.Total)
	}
}

func TestListSearch(t *testing.T) {
	resetDB(t)
	c := seedList(t)
	lr := listTasks(t, c, "?q=REPORT&sort=due_date&order=asc")
	assertTitles(t, titles(lr), "beta report", "alpha report")
}

func TestListSearchEscapesLikeWildcards(t *testing.T) {
	resetDB(t)
	c := seedList(t)
	lr := listTasks(t, c, "?q=%25")
	if lr.Meta.Total != 0 {
		t.Fatalf("%% search should match nothing, got %d", lr.Meta.Total)
	}
}

func TestListSortPriority(t *testing.T) {
	resetDB(t)
	c := seedList(t)
	lr := listTasks(t, c, "?sort=priority&order=desc")
	got := titles(lr)
	// high first, low last; ties broken by created_at desc
	if got[len(got)-1] != "beta report" {
		t.Fatalf("low priority should be last: %v", got)
	}
	if got[0] != "delta notes" && got[0] != "alpha report" {
		t.Fatalf("high priority should be first: %v", got)
	}
}

func TestListSortDueDateNullsLast(t *testing.T) {
	resetDB(t)
	c := seedList(t)
	lr := listTasks(t, c, "?sort=due_date&order=asc")
	assertTitles(t, titles(lr), "beta report", "gamma notes", "alpha report", "delta notes")
}

func TestListPaginationCombined(t *testing.T) {
	resetDB(t)
	c := signup(t, "page@example.com")
	for i := 1; i <= 5; i++ {
		createTask(t, c, map[string]any{
			"title": fmt.Sprintf("task %02d", i), "status": "todo",
			"due_date": fmt.Sprintf("2026-08-%02d", i),
		})
	}
	createTask(t, c, map[string]any{"title": "task other", "status": "done", "due_date": "2026-08-09"})

	// filter+search+sort+pagination together
	lr := listTasks(t, c, "?status=todo&q=task&sort=due_date&order=asc&page=2&limit=2")
	assertTitles(t, titles(lr), "task 03", "task 04")
	if lr.Meta.Total != 5 || lr.Meta.TotalPages != 3 || lr.Meta.Page != 2 {
		t.Fatalf("meta = %+v", lr.Meta)
	}
}

func TestListScopedToUser(t *testing.T) {
	resetDB(t)
	a := signup(t, "lista@example.com")
	b := signup(t, "listb@example.com")
	createTask(t, a, map[string]any{"title": "a's task"})
	lr := listTasks(t, b, "")
	if lr.Meta.Total != 0 {
		t.Fatalf("user b sees %d tasks, want 0", lr.Meta.Total)
	}
}

func TestListRejectsBadParams(t *testing.T) {
	resetDB(t)
	c := signup(t, "bad@example.com")
	for _, q := range []string{"?status=nope", "?sort=email", "?order=sideways", "?page=0", "?limit=1000"} {
		rec := doReq(t, "GET", "/tasks"+q, nil, c)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s: got %d, want 422", q, rec.Code)
		}
	}
}
