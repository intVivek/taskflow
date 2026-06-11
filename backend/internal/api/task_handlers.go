package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"taskflow/internal/store"
)

var (
	validStatus   = map[string]bool{"todo": true, "in_progress": true, "done": true}
	validPriority = map[string]bool{"low": true, "medium": true, "high": true}
)

// taskDTO is the wire shape; due_date renders as YYYY-MM-DD.
// owner_email is only populated for admin scope=all responses (omitempty hides it otherwise).
type taskDTO struct {
	ID          uuid.UUID `json:"id"`
	UserID      uuid.UUID `json:"user_id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	Priority    string    `json:"priority"`
	DueDate     *string   `json:"due_date"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	OwnerEmail  *string   `json:"owner_email,omitempty"`
}

func toDTO(t store.Task) taskDTO {
	var due *string
	if t.DueDate != nil {
		s := t.DueDate.Format("2006-01-02")
		due = &s
	}
	return taskDTO{
		ID: t.ID, UserID: t.UserID, Title: t.Title, Description: t.Description,
		Status: t.Status, Priority: t.Priority, DueDate: due,
		CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt,
	}
}

func toDTOWithOwner(tw store.TaskWithOwner) taskDTO {
	dto := toDTO(tw.Task)
	dto.OwnerEmail = tw.OwnerEmail
	return dto
}

func parseDueDate(s string) (*time.Time, bool) {
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, false
	}
	return &d, true
}

type createTaskReq struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	DueDate     *string `json:"due_date"`
}

func (req *createTaskReq) validate() (map[string]string, *time.Time) {
	fields := map[string]string{}
	if req.Title == "" || utf8.RuneCountInString(req.Title) > 200 {
		fields["title"] = "is required and must be at most 200 characters"
	}
	if utf8.RuneCountInString(req.Description) > 5000 {
		fields["description"] = "must be at most 5000 characters"
	}
	if req.Status == "" {
		req.Status = "todo"
	} else if !validStatus[req.Status] {
		fields["status"] = "must be one of: todo, in_progress, done"
	}
	if req.Priority == "" {
		req.Priority = "medium"
	} else if !validPriority[req.Priority] {
		fields["priority"] = "must be one of: low, medium, high"
	}
	var due *time.Time
	if req.DueDate != nil {
		d, ok := parseDueDate(*req.DueDate)
		if !ok {
			fields["due_date"] = "must be a date in YYYY-MM-DD format"
		}
		due = d
	}
	if len(fields) == 0 {
		return nil, due
	}
	return fields, nil
}

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	var req createTaskReq
	if !decodeBody(w, r, &req) {
		return
	}
	fields, due := req.validate()
	if fields != nil {
		writeValidationError(w, fields)
		return
	}
	var t store.Task
	err := s.st.InTx(r.Context(), func(q *store.Queries) error {
		var txErr error
		t, txErr = q.CreateTask(r.Context(), store.CreateTaskParams{
			UserID: claims.UserID, Title: req.Title, Description: req.Description,
			Status: req.Status, Priority: req.Priority, DueDate: due,
		})
		if txErr != nil {
			return txErr
		}
		return q.InsertActivity(r.Context(), store.InsertActivityParams{
			TaskID:  t.ID,
			ActorID: pgtype.UUID{Bytes: claims.UserID, Valid: true},
			Action:  "created",
			Changes: nil,
		})
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create task")
		return
	}
	writeJSON(w, http.StatusCreated, toDTO(t))
}

// taskID parses the {id} path segment; writes 404 on malformed UUIDs
// (a non-UUID id is indistinguishable from a missing task to the client).
func taskID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return uuid.Nil, false
	}
	return id, true
}

func (s *Server) handleGetTask(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	var (
		t   store.Task
		err error
	)
	if claims.Role == "admin" {
		t, err = s.st.GetTask(r.Context(), id)
	} else {
		t, err = s.st.GetTaskForUser(r.Context(), store.GetTaskForUserParams{ID: id, UserID: claims.UserID})
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "task not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load task")
		return
	}
	writeJSON(w, http.StatusOK, toDTO(t))
}

type updateTaskReq struct {
	Title       Optional[string] `json:"title"`
	Description Optional[string] `json:"description"`
	Status      Optional[string] `json:"status"`
	Priority    Optional[string] `json:"priority"`
	DueDate     Optional[string] `json:"due_date"`
}

func (req *updateTaskReq) validate() (map[string]string, *time.Time) {
	fields := map[string]string{}
	if req.Title.Set && (req.Title.Value == nil || *req.Title.Value == "" || utf8.RuneCountInString(*req.Title.Value) > 200) {
		fields["title"] = "is required and must be at most 200 characters"
	}
	if req.Description.Set && req.Description.Value != nil && utf8.RuneCountInString(*req.Description.Value) > 5000 {
		fields["description"] = "must be at most 5000 characters"
	}
	if req.Status.Set && (req.Status.Value == nil || !validStatus[*req.Status.Value]) {
		fields["status"] = "must be one of: todo, in_progress, done"
	}
	if req.Priority.Set && (req.Priority.Value == nil || !validPriority[*req.Priority.Value]) {
		fields["priority"] = "must be one of: low, medium, high"
	}
	var due *time.Time
	if req.DueDate.Set && req.DueDate.Value != nil {
		d, ok := parseDueDate(*req.DueDate.Value)
		if !ok {
			fields["due_date"] = "must be a date in YYYY-MM-DD format"
		}
		due = d
	}
	if len(fields) == 0 {
		return nil, due
	}
	return fields, nil
}

// dueDateStr converts a *time.Time due date to a *string "YYYY-MM-DD" for diff comparisons.
func dueDateStr(d *time.Time) *string {
	if d == nil {
		return nil
	}
	s := d.Format("2006-01-02")
	return &s
}

// truncate80 truncates a string to 80 runes and appends "…" if it was longer.
func truncate80(s string) string {
	runes := []rune(s)
	if len(runes) <= 80 {
		return s
	}
	return string(runes[:80]) + "…"
}

// buildUpdateDiff computes a field-level diff between pre and post task state
// given the update request. Returns nil if nothing changed.
func buildUpdateDiff(pre store.Task, post store.Task, req updateTaskReq) map[string]map[string]any {
	diff := map[string]map[string]any{}

	if req.Title.Set && post.Title != pre.Title {
		diff["title"] = map[string]any{"from": pre.Title, "to": post.Title}
	}
	if req.Description.Set && post.Description != pre.Description {
		diff["description"] = map[string]any{
			"from": truncate80(pre.Description),
			"to":   truncate80(post.Description),
		}
	}
	if req.Status.Set && post.Status != pre.Status {
		diff["status"] = map[string]any{"from": pre.Status, "to": post.Status}
	}
	if req.Priority.Set && post.Priority != pre.Priority {
		diff["priority"] = map[string]any{"from": pre.Priority, "to": post.Priority}
	}
	if req.DueDate.Set {
		preStr := dueDateStr(pre.DueDate)
		postStr := dueDateStr(post.DueDate)
		// Compare string representations; both nil means no change.
		preVal := (*string)(nil)
		postVal := (*string)(nil)
		if preStr != nil {
			preVal = preStr
		}
		if postStr != nil {
			postVal = postStr
		}
		changed := (preVal == nil) != (postVal == nil)
		if !changed && preVal != nil {
			changed = *preVal != *postVal
		}
		if changed {
			var fromAny, toAny any
			if preVal != nil {
				fromAny = *preVal
			}
			if postVal != nil {
				toAny = *postVal
			}
			diff["due_date"] = map[string]any{"from": fromAny, "to": toAny}
		}
	}

	if len(diff) == 0 {
		return nil
	}
	return diff
}

func (s *Server) handleUpdateTask(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	var req updateTaskReq
	if !decodeBody(w, r, &req) {
		return
	}
	fields, due := req.validate()
	if fields != nil {
		writeValidationError(w, fields)
		return
	}
	var t store.Task
	err := s.st.InTx(r.Context(), func(q *store.Queries) error {
		pre, txErr := q.GetTaskForUser(r.Context(), store.GetTaskForUserParams{ID: id, UserID: claims.UserID})
		if txErr != nil {
			return txErr
		}
		t, txErr = q.UpdateTaskForUser(r.Context(), store.UpdateTaskForUserParams{
			ID: id, UserID: claims.UserID,
			Title: req.Title.Value, Description: req.Description.Value,
			Status: req.Status.Value, Priority: req.Priority.Value,
			DueDateSet: req.DueDate.Set, DueDate: due,
		})
		if txErr != nil {
			return txErr
		}
		diff := buildUpdateDiff(pre, t, req)
		if diff == nil {
			// No meaningful change — skip activity entry.
			return nil
		}
		changesJSON, txErr := json.Marshal(diff)
		if txErr != nil {
			return txErr
		}
		return q.InsertActivity(r.Context(), store.InsertActivityParams{
			TaskID:  id,
			ActorID: pgtype.UUID{Bytes: claims.UserID, Valid: true},
			Action:  "updated",
			Changes: changesJSON,
		})
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "task not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not update task")
		return
	}
	writeJSON(w, http.StatusOK, toDTO(t))
}

func (s *Server) handleDeleteTask(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	id, ok := taskID(w, r)
	if !ok {
		return
	}
	// No activity insertion needed: task_activity rows cascade-delete with the task
	// (ON DELETE CASCADE), so there is nothing to preserve.
	n, err := s.st.DeleteTaskForUser(r.Context(), store.DeleteTaskForUserParams{ID: id, UserID: claims.UserID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not delete task")
		return
	}
	if n == 0 {
		writeError(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	q := r.URL.Query()
	fields := map[string]string{}

	// scope param: "" (own tasks) or "all" (admin only).
	scope := q.Get("scope")
	if scope != "" && scope != "all" {
		fields["scope"] = `must be "all" or omitted`
	}

	status := q.Get("status")
	if status != "" && !validStatus[status] {
		fields["status"] = "must be one of: todo, in_progress, done"
	}
	sort := q.Get("sort")
	if sort == "" {
		sort = "created_at"
	}
	if sort != "due_date" && sort != "priority" && sort != "created_at" {
		fields["sort"] = "must be one of: due_date, priority, created_at"
	}
	order := q.Get("order")
	if order == "" {
		order = "desc"
	}
	if order != "asc" && order != "desc" {
		fields["order"] = "must be asc or desc"
	}
	page := 1
	if v := q.Get("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			fields["page"] = "must be a positive integer"
		} else {
			page = n
		}
	}
	limit := 20
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			fields["limit"] = "must be between 1 and 100"
		} else {
			limit = n
		}
	}
	if len(fields) > 0 {
		writeValidationError(w, fields)
		return
	}

	// scope=all requires admin role.
	allUsers := scope == "all"
	if allUsers && claims.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "admin access required")
		return
	}

	tasks, total, err := s.st.ListTasks(r.Context(), store.ListTasksParams{
		UserID: claims.UserID, AllUsers: allUsers,
		Status: status, Query: q.Get("q"),
		Sort: sort, Order: order, Limit: limit, Offset: (page - 1) * limit,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list tasks")
		return
	}
	dtos := make([]taskDTO, len(tasks))
	for i, tw := range tasks {
		dtos[i] = toDTOWithOwner(tw)
	}
	totalPages := int((total + int64(limit) - 1) / int64(limit))
	writeJSON(w, http.StatusOK, listEnvelope{Data: dtos, Meta: listMeta{
		Page: page, Limit: limit, Total: total, TotalPages: totalPages,
	}})
}
