package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

type ListTasksParams struct {
	UserID   uuid.UUID
	AllUsers bool   // admin only: skip user_id predicate, LEFT JOIN users for owner email
	Status   string // "" = all
	Query    string // "" = no search
	Sort     string // due_date | priority | created_at
	Order    string // asc | desc
	Limit    int
	Offset   int
}

// TaskWithOwner carries a Task plus the optional owner email (populated only
// when AllUsers=true; nil otherwise).
type TaskWithOwner struct {
	Task
	OwnerEmail *string
}

var sortExprs = map[string]string{
	"due_date":   "t.due_date",
	"priority":   "CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END",
	"created_at": "t.created_at",
}

func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

// ListTasks is hand-built because ORDER BY direction and expression can't be
// parameterized; sort/order are mapped through whitelists, never interpolated
// from user input.
//
// When p.AllUsers is true the user_id predicate is omitted and a LEFT JOIN on
// users is added so each row carries the owner's email.  The existing single-
// user code path is unchanged: OwnerEmail is always nil in that case.
func (s *Store) ListTasks(ctx context.Context, p ListTasksParams) ([]TaskWithOwner, int64, error) {
	expr, ok := sortExprs[p.Sort]
	if !ok {
		return nil, 0, fmt.Errorf("invalid sort %q", p.Sort)
	}
	dir := "DESC"
	if p.Order == "asc" {
		dir = "ASC"
	}
	nulls := ""
	if p.Sort == "due_date" {
		nulls = " NULLS LAST"
	}

	// Build WHERE clause and args.  For the admin all-users path we skip the
	// user_id constraint; the column qualifier t. avoids ambiguity after the JOIN.
	var where string
	var args []any
	if p.AllUsers {
		where = "1=1"
	} else {
		where = "t.user_id = $1"
		args = append(args, p.UserID)
	}
	if p.Status != "" {
		args = append(args, p.Status)
		where += fmt.Sprintf(" AND t.status = $%d", len(args))
	}
	if p.Query != "" {
		args = append(args, "%"+escapeLike(p.Query)+"%")
		where += fmt.Sprintf(" AND t.title ILIKE $%d", len(args))
	}

	// COUNT query — no JOIN needed, count from tasks directly.
	var total int64
	countFrom := "tasks t"
	if err := s.Pool.QueryRow(ctx,
		"SELECT count(*) FROM "+countFrom+" WHERE "+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count tasks: %w", err)
	}

	// For the admin path join users to fetch owner email.
	selectCols := "t.id, t.user_id, t.title, t.description, t.status, t.priority, t.due_date, t.created_at, t.updated_at"
	fromClause := "tasks t"
	if p.AllUsers {
		selectCols += ", u.email AS owner_email"
		fromClause += " LEFT JOIN users u ON u.id = t.user_id"
	}

	args = append(args, p.Limit, p.Offset)
	q := fmt.Sprintf(`SELECT %s
FROM %s WHERE %s
ORDER BY %s %s%s, t.created_at DESC
LIMIT $%d OFFSET $%d`, selectCols, fromClause, where, expr, dir, nulls, len(args)-1, len(args))

	rows, err := s.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()

	tasks := []TaskWithOwner{}
	for rows.Next() {
		var tw TaskWithOwner
		t := &tw.Task
		if p.AllUsers {
			if err := rows.Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status,
				&t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt, &tw.OwnerEmail); err != nil {
				return nil, 0, fmt.Errorf("scan task: %w", err)
			}
		} else {
			if err := rows.Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status,
				&t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt); err != nil {
				return nil, 0, fmt.Errorf("scan task: %w", err)
			}
		}
		tasks = append(tasks, tw)
	}
	return tasks, total, rows.Err()
}

// GetTask fetches a task by ID only, without filtering by user.  Used by
// admins who may view any task regardless of ownership.
func (s *Store) GetTask(ctx context.Context, id uuid.UUID) (Task, error) {
	const q = `SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
FROM tasks WHERE id = $1`
	row := s.Pool.QueryRow(ctx, q, id)
	var t Task
	err := row.Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status,
		&t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}
