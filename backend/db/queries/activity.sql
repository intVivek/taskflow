-- name: InsertActivity :exec
INSERT INTO task_activity (task_id, actor_id, action, changes)
VALUES ($1, $2, $3, $4);

-- name: ListActivityForTask :many
SELECT a.id, a.action, a.changes, a.created_at, u.email AS actor_email
FROM task_activity a
LEFT JOIN users u ON u.id = a.actor_id
WHERE a.task_id = $1
ORDER BY a.created_at DESC, a.id DESC
LIMIT 50;
