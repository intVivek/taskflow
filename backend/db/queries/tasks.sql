-- name: CreateTask :one
INSERT INTO tasks (user_id, title, description, status, priority, due_date)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetTaskForUser :one
SELECT * FROM tasks
WHERE id = $1 AND user_id = $2;

-- name: UpdateTaskForUser :one
UPDATE tasks SET
    title       = COALESCE(sqlc.narg('title'), title),
    description = COALESCE(sqlc.narg('description'), description),
    status      = COALESCE(sqlc.narg('status'), status),
    priority    = COALESCE(sqlc.narg('priority'), priority),
    due_date    = CASE WHEN sqlc.arg('due_date_set')::bool THEN sqlc.narg('due_date') ELSE due_date END,
    updated_at  = now()
WHERE id = sqlc.arg('id') AND user_id = sqlc.arg('user_id')
RETURNING *;

-- name: DeleteTaskForUser :execrows
DELETE FROM tasks
WHERE id = $1 AND user_id = $2;
