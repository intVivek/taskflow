package api_test

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestSSE_UnauthenticatedReturns401 verifies that GET /events without a
// session cookie returns 401.
func TestSSE_UnauthenticatedReturns401(t *testing.T) {
	rec := doReq(t, "GET", "/events", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestSSE_ConnectedEventAndTaskCreated opens a real SSE connection, asserts
// the `: connected` greeting arrives, creates a task, and asserts the
// task.created event is delivered within 2 seconds.
func TestSSE_ConnectedEventAndTaskCreated(t *testing.T) {
	resetDB(t)

	// Start a real HTTP server (not httptest.NewRecorder) so SSE streaming works.
	srv := httptest.NewServer(testHandler)
	defer srv.Close()

	cookie := signup(t, "sse@example.com")

	// Open SSE connection with 5-second context.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", srv.URL+"/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(cookie)

	client := &http.Client{} // no Timeout: context carries the deadline
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("GET /events: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("Content-Type: got %q", ct)
	}

	lines := make(chan string, 64)
	go func() {
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			lines <- scanner.Text()
		}
		close(lines)
	}()

	// Wait for `: connected` greeting.
	if !waitLine(t, lines, ": connected", 2*time.Second) {
		t.Fatal("did not receive ': connected' greeting")
	}

	// Create a task via the real server using the cookie.
	taskClient := &http.Client{}
	taskReq, err := http.NewRequest("POST", srv.URL+"/tasks",
		strings.NewReader(`{"title":"SSE Test Task","status":"todo","priority":"medium"}`))
	if err != nil {
		t.Fatal(err)
	}
	taskReq.Header.Set("Content-Type", "application/json")
	taskReq.AddCookie(cookie)
	taskResp, err := taskClient.Do(taskReq)
	if err != nil {
		t.Fatalf("POST /tasks: %v", err)
	}
	taskResp.Body.Close()
	if taskResp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /tasks: expected 201, got %d", taskResp.StatusCode)
	}

	// Expect event: task line.
	if !waitLine(t, lines, "event: task", 2*time.Second) {
		t.Fatal("did not receive 'event: task' line")
	}

	// Expect data line containing task.created and task title.
	if !waitLineContains(t, lines, `"type":"task.created"`, 2*time.Second) {
		t.Fatal("did not receive data line with type:task.created")
	}
}

// waitLine reads from lines until a line equal to want is found or the
// timeout expires. Returns true if found.
func waitLine(t *testing.T, lines <-chan string, want string, timeout time.Duration) bool {
	t.Helper()
	deadline := time.After(timeout)
	for {
		select {
		case line, ok := <-lines:
			if !ok {
				t.Logf("waitLine: channel closed before finding %q", want)
				return false
			}
			t.Logf("SSE line: %q", line)
			if line == want {
				return true
			}
		case <-deadline:
			return false
		}
	}
}

// waitLineContains reads from lines until a line containing substr is found
// or the timeout expires. Returns true if found.
func waitLineContains(t *testing.T, lines <-chan string, substr string, timeout time.Duration) bool {
	t.Helper()
	deadline := time.After(timeout)
	for {
		select {
		case line, ok := <-lines:
			if !ok {
				t.Logf("waitLineContains: channel closed before finding %q", substr)
				return false
			}
			t.Logf("SSE line: %q", line)
			if strings.Contains(line, substr) {
				return true
			}
		case <-deadline:
			return false
		}
	}
}


