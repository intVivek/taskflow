package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"taskflow/db"
	"taskflow/internal/api"
	"taskflow/internal/config"
	"taskflow/internal/store"
)

var (
	testHandler http.Handler
	testPool    *pgxpool.Pool
)

func TestMain(m *testing.M) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:postgres@localhost:5432/taskflow_test?sslmode=disable"
	}
	ctx := context.Background()

	adminURL := strings.Replace(url, "/taskflow_test", "/postgres", 1)
	admin, err := pgx.Connect(ctx, adminURL)
	if err != nil {
		os.Stderr.WriteString("postgres unavailable, run: docker compose up -d db\n")
		os.Exit(1)
	}
	_, err = admin.Exec(ctx, "CREATE DATABASE taskflow_test")
	if err != nil && !strings.Contains(err.Error(), "already exists") {
		panic(err)
	}
	admin.Close(ctx)

	if err := db.Migrate(url); err != nil {
		panic(err)
	}
	testPool, err = pgxpool.New(ctx, url)
	if err != nil {
		panic(err)
	}
	st := store.NewStore(testPool)
	testHandler = api.New(config.Config{JWTSecret: "test-secret", Env: "test"}, st).Handler()

	code := m.Run()
	testPool.Close()
	os.Exit(code)
}

// resetDB truncates all data between tests.
func resetDB(t *testing.T) {
	t.Helper()
	_, err := testPool.Exec(context.Background(), "TRUNCATE users CASCADE")
	if err != nil {
		t.Fatal(err)
	}
}

// doReq performs a JSON request against the test handler. cookie may be nil.
func doReq(t *testing.T, method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rdr)
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	testHandler.ServeHTTP(rec, req)
	return rec
}

// decode unmarshals a recorder body into v.
func decode(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), v); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
}

// sessionCookie extracts the auth cookie from a response.
func sessionCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == "taskflow_session" {
			return c
		}
	}
	t.Fatal("no taskflow_session cookie in response")
	return nil
}

// signup creates a user and returns its session cookie.
func signup(t *testing.T, email string) *http.Cookie {
	t.Helper()
	rec := doReq(t, "POST", "/auth/signup", map[string]string{
		"email": email, "password": "password123",
	}, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("signup: got %d: %s", rec.Code, rec.Body.String())
	}
	return sessionCookie(t, rec)
}
