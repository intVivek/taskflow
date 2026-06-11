// Package main provides an idempotent seed script that upserts demo/admin
// accounts and creates sample tasks for the demo user.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"taskflow/db"
	"taskflow/internal/auth"
	"taskflow/internal/store"
)

const (
	demoPassword  = "taskflow-demo-123"
	adminEmail    = "admin@taskflow.dev"
	demoEmail     = "demo@taskflow.dev"
)

type seedUser struct {
	id    uuid.UUID
	email string
	role  string
}

func main() {
	ctx := context.Background()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	slog.Info("running migrations")
	if err := db.Migrate(dbURL); err != nil {
		slog.Error("migrate failed", "err", err)
		os.Exit(1)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		slog.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	st := store.NewStore(pool)

	// Hash the shared demo password once.
	hash, err := auth.HashPassword(demoPassword)
	if err != nil {
		slog.Error("hash password failed", "err", err)
		os.Exit(1)
	}

	adminUser, err := upsertUser(ctx, pool, adminEmail, hash, "admin")
	if err != nil {
		slog.Error("upsert admin failed", "err", err)
		os.Exit(1)
	}
	slog.Info("upserted user", "email", adminUser.email, "role", adminUser.role, "id", adminUser.id)

	demoUser, err := upsertUser(ctx, pool, demoEmail, hash, "user")
	if err != nil {
		slog.Error("upsert demo failed", "err", err)
		os.Exit(1)
	}
	slog.Info("upserted user", "email", demoUser.email, "role", demoUser.role, "id", demoUser.id)

	taskCount, err := seedDemoTasks(ctx, st, demoUser.id)
	if err != nil {
		slog.Error("seed demo tasks failed", "err", err)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("=== Seed summary ===")
	fmt.Printf("  admin account : %s  (password: %s)\n", adminEmail, demoPassword)
	fmt.Printf("  demo account  : %s  (password: %s)\n", demoEmail, demoPassword)
	fmt.Printf("  demo tasks    : %d task(s) created (0 = already existed)\n", taskCount)
	fmt.Println("====================")
}

// upsertUser inserts or updates a user by email, returning the resolved id.
// Uses ON CONFLICT ... DO UPDATE to set the role so the script is idempotent.
func upsertUser(ctx context.Context, pool *pgxpool.Pool, email, hash, role string) (seedUser, error) {
	const q = `
		INSERT INTO users (email, password_hash, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (email) DO UPDATE
			SET role = EXCLUDED.role
		RETURNING id, email, role`

	var u seedUser
	row := pool.QueryRow(ctx, q, email, hash, role)
	if err := row.Scan(&u.id, &u.email, &u.role); err != nil {
		return seedUser{}, fmt.Errorf("upsert user %s: %w", email, err)
	}
	return u, nil
}

type taskSpec struct {
	title       string
	description string
	status      string
	priority    string
	dueDate     *time.Time
}

// demoTasks returns 12 varied tasks that look like a real product workspace.
func demoTasks() []taskSpec {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	yesterday := today.AddDate(0, 0, -1)
	lastWeek := today.AddDate(0, 0, -5)
	tomorrow := today.AddDate(0, 0, 1)
	nextWeek := today.AddDate(0, 0, 6)
	twoWeeks := today.AddDate(0, 0, 14)

	return []taskSpec{
		{
			title:       "Review Q3 launch checklist",
			description: "Go through every item on the Q3 product launch checklist with the PM and sign off before the kickoff call.",
			status:      "in_progress",
			priority:    "high",
			dueDate:     &tomorrow,
		},
		{
			title:       "Fix onboarding email typo",
			description: "\"Welcme to TaskFlow\" in the welcome email subject line – fix the typo and redeploy the template.",
			status:      "todo",
			priority:    "low",
			dueDate:     &nextWeek,
		},
		{
			title:       "Update pricing page copy",
			description: "Sync the pricing page with the new tier structure agreed in the last product meeting.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &nextWeek,
		},
		{
			title:       "Audit API rate-limit headers",
			description: "Verify that all endpoints return correct X-RateLimit-* headers and document any discrepancies.",
			status:      "done",
			priority:    "medium",
			dueDate:     &lastWeek,
		},
		{
			title:       "Set up staging environment",
			description: "Provision the staging stack on the new cloud account and wire up CI deployments.",
			status:      "done",
			priority:    "high",
			dueDate:     &yesterday,
		},
		{
			title:       "Write integration tests for auth flow",
			description: "Cover login, token refresh, and logout with end-to-end tests against the staging database.",
			status:      "in_progress",
			priority:    "high",
			dueDate:     &today,
		},
		{
			title:       "Research competitor feature gaps",
			description: "Compile a short report on features that top three competitors offer that TaskFlow doesn't yet.",
			status:      "todo",
			priority:    "low",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Migrate legacy CSV importer",
			description: "Port the old Python CSV import script to the new Go backend service and add validation.",
			status:      "todo",
			priority:    "medium",
			dueDate:     nil, // no due date
		},
		{
			title:       "Design dark-mode color tokens",
			description: "Work with design to define semantic color tokens for the dark theme and add them to the design system.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Resolve flaky webhook delivery test",
			description: "The webhook delivery test intermittently fails in CI. Investigate timing issue and fix the root cause.",
			status:      "in_progress",
			priority:    "high",
			dueDate:     &today,
		},
		{
			title:       "Document public REST API",
			description: "Generate OpenAPI spec from code annotations and publish to the developer docs site.",
			status:      "todo",
			priority:    "medium",
			dueDate:     nil, // no due date
		},
		{
			title:       "Archive completed Q2 sprint board",
			description: "Move all closed Q2 issues to the archive project and update the board template for Q3.",
			status:      "done",
			priority:    "low",
			dueDate:     &lastWeek,
		},
	}
}

// seedDemoTasks creates demo tasks for the given user if none exist yet.
// Returns the number of tasks created (0 if already present).
func seedDemoTasks(ctx context.Context, st *store.Store, userID uuid.UUID) (int, error) {
	// Count existing tasks for the demo user.
	var existing int
	row := st.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM tasks WHERE user_id = $1`, userID)
	if err := row.Scan(&existing); err != nil {
		return 0, fmt.Errorf("count tasks: %w", err)
	}
	if existing > 0 {
		slog.Info("demo tasks already present", "count", existing)
		return 0, nil
	}

	specs := demoTasks()
	created := 0

	for _, spec := range specs {
		spec := spec // capture
		err := st.InTx(ctx, func(q *store.Queries) error {
			t, err := q.CreateTask(ctx, store.CreateTaskParams{
				UserID:      userID,
				Title:       spec.title,
				Description: spec.description,
				Status:      spec.status,
				Priority:    spec.priority,
				DueDate:     spec.dueDate,
			})
			if err != nil {
				return fmt.Errorf("create task %q: %w", spec.title, err)
			}
			return q.InsertActivity(ctx, store.InsertActivityParams{
				TaskID:  t.ID,
				ActorID: pgtype.UUID{Bytes: userID, Valid: true},
				Action:  "created",
				Changes: nil,
			})
		})
		if err != nil {
			return created, err
		}
		created++
		slog.Info("created task", "title", spec.title, "status", spec.status, "priority", spec.priority)
	}

	return created, nil
}
