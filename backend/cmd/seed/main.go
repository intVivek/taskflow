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

// demoTasks returns 50 varied tasks that look like a real product workspace —
// enough to exercise pagination (20 per page) in the demo account.
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
		{
			title:       "Profile slow dashboard queries",
			description: "EXPLAIN ANALYZE the three slowest dashboard queries and add covering indexes where it pays off.",
			status:      "todo",
			priority:    "high",
			dueDate:     &tomorrow,
		},
		{
			title:       "Rotate production API keys",
			description: "Quarterly rotation of third-party API keys; update the secrets manager and restart workers.",
			status:      "todo",
			priority:    "high",
			dueDate:     &yesterday, // overdue on purpose
		},
		{
			title:       "Refactor notification service",
			description: "Split the monolithic notifier into channel-specific senders with a shared retry queue.",
			status:      "in_progress",
			priority:    "medium",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Prepare board deck for investor sync",
			description: "Pull Q2 growth metrics into the standard deck template and circulate for comments.",
			status:      "todo",
			priority:    "high",
			dueDate:     &nextWeek,
		},
		{
			title:       "Fix mobile nav overflow on small screens",
			description: "The hamburger menu clips on 320px-wide viewports; adjust the breakpoint and retest.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &nextWeek,
		},
		{
			title:       "Upgrade Postgres to 16.4 on staging",
			description: "Apply the minor version upgrade on staging first, watch error rates for 24h, then plan prod.",
			status:      "done",
			priority:    "medium",
			dueDate:     &lastWeek,
		},
		{
			title:       "Add localization scaffolding",
			description: "Introduce a message catalog and extract the top 50 UI strings for translation.",
			status:      "todo",
			priority:    "low",
			dueDate:     nil,
		},
		{
			title:       "Interview candidates for support role",
			description: "Two phone screens scheduled this week; share structured feedback in the hiring doc.",
			status:      "in_progress",
			priority:    "medium",
			dueDate:     &tomorrow,
		},
		{
			title:       "Clean up unused feature flags",
			description: "Remove the six fully-rolled-out flags and their dead code paths.",
			status:      "todo",
			priority:    "low",
			dueDate:     nil,
		},
		{
			title:       "Draft incident response runbook",
			description: "Document the on-call escalation path, severity matrix, and postmortem template.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Benchmark SSE fan-out under load",
			description: "Simulate 5k concurrent subscribers and measure publish latency and memory profile.",
			status:      "todo",
			priority:    "low",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Update dependency licenses report",
			description: "Regenerate the third-party license inventory for the quarterly compliance review.",
			status:      "done",
			priority:    "low",
			dueDate:     &lastWeek,
		},
		{
			title:       "Tighten S3 bucket policies",
			description: "Audit public-read grants on the asset buckets and switch uploads to presigned URLs.",
			status:      "todo",
			priority:    "high",
			dueDate:     &today,
		},
		{
			title:       "Plan v2 onboarding flow experiment",
			description: "Define the success metric and cohort split for the new three-step onboarding test.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &nextWeek,
		},
		{
			title:       "Fix timezone bug in weekly digest",
			description: "Digests send at midnight UTC instead of the user's local 8am; respect the stored timezone.",
			status:      "in_progress",
			priority:    "high",
			dueDate:     &today,
		},
		{
			title:       "Consolidate duplicate customer records",
			description: "Run the dedupe script in dry-run mode, review the merge plan, then execute with backups.",
			status:      "todo",
			priority:    "medium",
			dueDate:     nil,
		},
		{
			title:       "Review GDPR data-retention policy",
			description: "Confirm deletion jobs cover all user-generated tables and update the privacy page wording.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Add request tracing to the API gateway",
			description: "Propagate trace IDs through the proxy so backend logs correlate with edge requests.",
			status:      "in_progress",
			priority:    "medium",
			dueDate:     &nextWeek,
		},
		{
			title:       "Write changelog for the June release",
			description: "Summarize the eight shipped features in user-facing language and post to the blog.",
			status:      "done",
			priority:    "low",
			dueDate:     &yesterday,
		},
		{
			title:       "Fix CSV export encoding for Excel",
			description: "Exports open garbled in Excel on Windows — add a UTF-8 BOM and verify with a customer file.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &nextWeek,
		},
		{
			title:       "Set up uptime monitoring alerts",
			description: "Add health-check monitors for the API and app with paging only on 3 consecutive failures.",
			status:      "done",
			priority:    "high",
			dueDate:     &lastWeek,
		},
		{
			title:       "Evaluate feature-flag vendors",
			description: "Compare the two shortlisted vendors on price, SDK quality, and audit logging.",
			status:      "todo",
			priority:    "low",
			dueDate:     nil,
		},
		{
			title:       "Compress hero images on the landing page",
			description: "LCP is 3.8s on mobile; convert hero assets to AVIF and lazy-load below-the-fold media.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &tomorrow,
		},
		{
			title:       "Patch CVE in the YAML parsing library",
			description: "Bump the vulnerable transitive dependency and re-run the security scanner to confirm.",
			status:      "done",
			priority:    "high",
			dueDate:     &lastWeek,
		},
		{
			title:       "Sketch mobile widget concept",
			description: "Rough wireframes for a today-view home-screen widget; review with design on Thursday.",
			status:      "todo",
			priority:    "low",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Reduce Docker image build time",
			description: "Layer caching is busted by the asset step — reorder the Dockerfile and measure CI savings.",
			status:      "in_progress",
			priority:    "low",
			dueDate:     nil,
		},
		{
			title:       "Backfill missing avatars in search index",
			description: "Roughly 4% of profiles index without avatar URLs; rerun the enrichment job for the gap window.",
			status:      "todo",
			priority:    "low",
			dueDate:     nil,
		},
		{
			title:       "Define SLOs for the public API",
			description: "Agree availability and latency targets with support, then encode them in the dashboards.",
			status:      "todo",
			priority:    "medium",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Test restore from last night's backup",
			description: "Quarterly disaster-recovery drill: restore into an isolated environment and diff row counts.",
			status:      "todo",
			priority:    "high",
			dueDate:     &nextWeek,
		},
		{
			title:       "Remove deprecated v1 endpoints",
			description: "Traffic to /v1 has been zero for 60 days — delete the handlers and update the docs.",
			status:      "todo",
			priority:    "low",
			dueDate:     nil,
		},
		{
			title:       "Improve empty-state illustrations",
			description: "Replace placeholder graphics on the reports and team pages with the new brand set.",
			status:      "todo",
			priority:    "low",
			dueDate:     &twoWeeks,
		},
		{
			title:       "Negotiate CDN contract renewal",
			description: "Current term ends next month; gather usage stats and push for the committed-use discount.",
			status:      "in_progress",
			priority:    "medium",
			dueDate:     &nextWeek,
		},
		{
			title:       "Instrument signup funnel events",
			description: "Add analytics events for each signup step so we can see where drop-off happens.",
			status:      "done",
			priority:    "medium",
			dueDate:     &lastWeek,
		},
		{
			title:       "Harden webhook signature validation",
			description: "Reject requests with stale timestamps and rotate the signing secret for two customers.",
			status:      "todo",
			priority:    "high",
			dueDate:     &nextWeek,
		},
		{
			title:       "Spike: offline mode feasibility",
			description: "Two-day spike on service-worker caching strategy and conflict resolution for offline edits.",
			status:      "todo",
			priority:    "low",
			dueDate:     nil,
		},
		{
			title:       "Update on-call rotation for July",
			description: "Two engineers are on leave — reshuffle the schedule and confirm handoff notes.",
			status:      "done",
			priority:    "low",
			dueDate:     &yesterday,
		},
		{
			title:       "Fix race condition in session refresh",
			description: "Concurrent tabs occasionally log out — serialize the refresh call behind a mutex in the client.",
			status:      "in_progress",
			priority:    "high",
			dueDate:     &today,
		},
		{
			title:       "Archive stale customer feedback tickets",
			description: "Close feedback items older than a year with a polite template and tag recurring themes.",
			status:      "todo",
			priority:    "low",
			dueDate:     nil,
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
