package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

type ListTasksParams struct {
	UserID uuid.UUID
	Status string // "" = all
	Query  string // "" = no search
	Sort   string // due_date | priority | created_at
	Order  string // asc | desc
	Limit  int
	Offset int
}

var sortExprs = map[string]string{
	"due_date":   "due_date",
	"priority":   "CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END",
	"created_at": "created_at",
}

func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

// ListTasks is hand-built because ORDER BY direction and expression can't be
// parameterized; sort/order are mapped through whitelists, never interpolated
// from user input.
func (s *Store) ListTasks(ctx context.Context, p ListTasksParams) ([]Task, int64, error) {
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

	where := "user_id = $1"
	args := []any{p.UserID}
	if p.Status != "" {
		args = append(args, p.Status)
		where += fmt.Sprintf(" AND status = $%d", len(args))
	}
	if p.Query != "" {
		args = append(args, "%"+escapeLike(p.Query)+"%")
		where += fmt.Sprintf(" AND title ILIKE $%d", len(args))
	}

	var total int64
	if err := s.Pool.QueryRow(ctx, "SELECT count(*) FROM tasks WHERE "+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count tasks: %w", err)
	}

	args = append(args, p.Limit, p.Offset)
	q := fmt.Sprintf(`SELECT id, user_id, title, description, status, priority, due_date, created_at, updated_at
FROM tasks WHERE %s
ORDER BY %s %s%s, created_at DESC
LIMIT $%d OFFSET $%d`, where, expr, dir, nulls, len(args)-1, len(args))

	rows, err := s.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()

	tasks := []Task{}
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status,
			&t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan task: %w", err)
		}
		tasks = append(tasks, t)
	}
	return tasks, total, rows.Err()
}
