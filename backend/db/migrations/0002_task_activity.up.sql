CREATE TABLE task_activity (
    id         bigserial PRIMARY KEY,
    task_id    uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    actor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    action     text NOT NULL CHECK (action IN ('created','updated','deleted','attachment_added','attachment_removed')),
    changes    jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_activity_task_idx ON task_activity (task_id, created_at DESC);
