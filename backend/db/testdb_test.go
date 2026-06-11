package db_test

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// mustCreateTestDB connects to the server's default db and creates the test
// database if it doesn't exist.
func mustCreateTestDB(t *testing.T, url string) {
	t.Helper()
	adminURL := strings.Replace(url, "/taskflow_test", "/postgres", 1)
	conn, err := pgx.Connect(context.Background(), adminURL)
	if err != nil {
		t.Skipf("postgres not available: %v (run: docker compose up -d db)", err)
	}
	defer conn.Close(context.Background())
	_, err = conn.Exec(context.Background(), "CREATE DATABASE taskflow_test")
	if err != nil && !strings.Contains(err.Error(), "already exists") {
		t.Fatal(err)
	}
}
