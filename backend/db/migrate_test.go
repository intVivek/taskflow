package db_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"

	"taskflow/db"
)

func TestMigrate(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:postgres@localhost:5432/taskflow_test?sslmode=disable"
	}
	mustCreateTestDB(t, url)
	if err := db.Migrate(url); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// idempotent
	if err := db.Migrate(url); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	conn, err := pgx.Connect(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(context.Background())
	var n int
	if err := conn.QueryRow(context.Background(),
		`SELECT count(*) FROM information_schema.tables WHERE table_name IN ('users','tasks')`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("got %d tables, want 2", n)
	}
}
