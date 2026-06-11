package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"taskflow/internal/store"
)

// activityEntryDTO is the wire shape for a single activity log entry.
type activityEntryDTO struct {
	ID         int64            `json:"id"`
	Action     string           `json:"action"`
	ActorEmail *string          `json:"actor_email"`
	Changes    json.RawMessage  `json:"changes"`
	CreatedAt  time.Time        `json:"created_at"`
}

type activityListEnvelope struct {
	Data []activityEntryDTO `json:"data"`
}

func (s *Server) handleListActivity(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	id, ok := taskID(w, r)
	if !ok {
		return
	}

	// Verify access: admin may view any task; regular users must own the task.
	var err error
	if claims.Role == "admin" {
		_, err = s.st.GetTask(r.Context(), id)
	} else {
		_, err = s.st.GetTaskForUser(r.Context(), store.GetTaskForUserParams{ID: id, UserID: claims.UserID})
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "task not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load task")
		return
	}

	rows, err := s.st.ListActivityForTask(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list activity")
		return
	}

	// Map rows to DTOs; changes is a []byte (jsonb) that passes through as
	// json.RawMessage; nil/empty bytes become JSON null.
	dtos := make([]activityEntryDTO, len(rows))
	for i, row := range rows {
		var raw json.RawMessage
		if len(row.Changes) > 0 {
			raw = json.RawMessage(row.Changes)
		}
		dtos[i] = activityEntryDTO{
			ID:         row.ID,
			Action:     row.Action,
			ActorEmail: row.ActorEmail,
			Changes:    raw,
			CreatedAt:  row.CreatedAt,
		}
	}

	writeJSON(w, http.StatusOK, activityListEnvelope{Data: dtos})
}
