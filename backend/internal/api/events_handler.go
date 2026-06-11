package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// taskEventPayload is the wire shape for SSE task events.
type taskEventPayload struct {
	Type   string    `json:"type"`
	Task   *taskDTO  `json:"task"`
	TaskID uuid.UUID `json:"task_id"`
}

// publishTaskEvent marshals a task event and delivers it to the user's
// SSE subscribers via the hub. It is a best-effort fire-and-forget: if
// marshaling fails the error is silently dropped (should never happen with
// well-typed inputs).
func publishTaskEvent(s *Server, userID uuid.UUID, typ string, task *taskDTO, taskID uuid.UUID) {
	payload := taskEventPayload{Type: typ, Task: task, TaskID: taskID}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	s.hub.Publish(userID, data)
}

// handleEvents streams task-change events to the authenticated user over
// Server-Sent Events.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal", "streaming unsupported")
		return
	}

	claims := claimsFrom(r.Context())

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Confirm connection to the client immediately.
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()

	ch, cancel := s.hub.Subscribe(claims.UserID)
	defer cancel()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case data, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: task\ndata: %s\n\n", data)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}
