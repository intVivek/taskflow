package api

import (
	"errors"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"taskflow/internal/store"
)

var (
	validStatus   = map[string]bool{"todo": true, "in_progress": true, "done": true}
	validPriority = map[string]bool{"low": true, "medium": true, "high": true}
)

// taskDTO is the wire shape; due_date renders as YYYY-MM-DD.
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
	t, err := s.st.CreateTask(r.Context(), store.CreateTaskParams{
		UserID: claims.UserID, Title: req.Title, Description: req.Description,
		Status: req.Status, Priority: req.Priority, DueDate: due,
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
	t, err := s.st.GetTaskForUser(r.Context(), store.GetTaskForUserParams{ID: id, UserID: claims.UserID})
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
	t, err := s.st.UpdateTaskForUser(r.Context(), store.UpdateTaskForUserParams{
		ID: id, UserID: claims.UserID,
		Title: req.Title.Value, Description: req.Description.Value,
		Status: req.Status.Value, Priority: req.Priority.Value,
		DueDateSet: req.DueDate.Set, DueDate: due,
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

	tasks, total, err := s.st.ListTasks(r.Context(), store.ListTasksParams{
		UserID: claims.UserID, Status: status, Query: q.Get("q"),
		Sort: sort, Order: order, Limit: limit, Offset: (page - 1) * limit,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list tasks")
		return
	}
	dtos := make([]taskDTO, len(tasks))
	for i, t := range tasks {
		dtos[i] = toDTO(t)
	}
	totalPages := int((total + int64(limit) - 1) / int64(limit))
	writeJSON(w, http.StatusOK, listEnvelope{Data: dtos, Meta: listMeta{
		Page: page, Limit: limit, Total: total, TotalPages: totalPages,
	}})
}
