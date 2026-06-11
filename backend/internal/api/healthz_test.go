package api_test

import (
	"net/http/httptest"
	"testing"

	"taskflow/internal/api"
	"taskflow/internal/config"
)

func TestHealthz(t *testing.T) {
	srv := api.New(config.Config{JWTSecret: "test", Env: "test"}, nil)
	req := httptest.NewRequest("GET", "/healthz", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}
