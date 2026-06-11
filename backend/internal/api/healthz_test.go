package api_test

import (
	"testing"
)

func TestHealthz(t *testing.T) {
	rec := doReq(t, "GET", "/healthz", nil, nil)
	if rec.Code != 200 {
		t.Fatalf("got %d, want 200", rec.Code)
	}
}
