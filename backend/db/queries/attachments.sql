-- name: InsertAttachment :one
INSERT INTO attachments (task_id, filename, content_type, size_bytes, data)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, task_id, filename, content_type, size_bytes, created_at;

-- name: ListAttachmentsForTask :many
SELECT id, task_id, filename, content_type, size_bytes, created_at
FROM attachments
WHERE task_id = $1
ORDER BY created_at DESC;

-- name: GetAttachmentWithOwner :one
SELECT a.id, a.task_id, a.filename, a.content_type, a.size_bytes, a.data, a.created_at,
       t.user_id AS owner_id
FROM attachments a
JOIN tasks t ON t.id = a.task_id
WHERE a.id = $1;

-- name: DeleteAttachment :execrows
DELETE FROM attachments
WHERE id = $1;
