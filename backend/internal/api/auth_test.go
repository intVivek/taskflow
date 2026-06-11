package api_test

import (
	"net/http"
	"testing"
)

func TestSignupLoginMe(t *testing.T) {
	resetDB(t)

	rec := doReq(t, "POST", "/auth/signup", map[string]string{
		"email": "a@example.com", "password": "password123",
	}, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("signup: got %d: %s", rec.Code, rec.Body.String())
	}
	c := sessionCookie(t, rec)
	if !c.HttpOnly {
		t.Fatal("session cookie must be httpOnly")
	}

	var me struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	rec = doReq(t, "GET", "/auth/me", nil, c)
	if rec.Code != http.StatusOK {
		t.Fatalf("me: got %d", rec.Code)
	}
	decode(t, rec, &me)
	if me.Email != "a@example.com" || me.Role != "user" {
		t.Fatalf("unexpected me: %+v", me)
	}

	rec = doReq(t, "POST", "/auth/login", map[string]string{
		"email": "a@example.com", "password": "password123",
	}, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("login: got %d: %s", rec.Code, rec.Body.String())
	}
	sessionCookie(t, rec)
}

func TestSignupDuplicateEmail(t *testing.T) {
	resetDB(t)
	signup(t, "dupe@example.com")
	rec := doReq(t, "POST", "/auth/signup", map[string]string{
		"email": "DUPE@example.com", "password": "password123", // citext: case-insensitive
	}, nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409: %s", rec.Code, rec.Body.String())
	}
}

func TestSignupValidation(t *testing.T) {
	resetDB(t)
	rec := doReq(t, "POST", "/auth/signup", map[string]string{
		"email": "not-an-email", "password": "short",
	}, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d, want 422: %s", rec.Code, rec.Body.String())
	}
	var e struct {
		Error struct {
			Fields map[string]string `json:"fields"`
		} `json:"error"`
	}
	decode(t, rec, &e)
	if e.Error.Fields["email"] == "" || e.Error.Fields["password"] == "" {
		t.Fatalf("expected field errors for email and password, got %+v", e.Error.Fields)
	}
}

func TestLoginWrongPassword(t *testing.T) {
	resetDB(t)
	signup(t, "b@example.com")
	rec := doReq(t, "POST", "/auth/login", map[string]string{
		"email": "b@example.com", "password": "wrong-password",
	}, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestMeRequiresAuth(t *testing.T) {
	rec := doReq(t, "GET", "/auth/me", nil, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestLogoutClearsCookie(t *testing.T) {
	resetDB(t)
	c := signup(t, "c@example.com")
	rec := doReq(t, "POST", "/auth/logout", nil, c)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("got %d, want 204", rec.Code)
	}
	cleared := sessionCookie(t, rec)
	if cleared.MaxAge != -1 {
		t.Fatalf("cookie MaxAge = %d, want -1", cleared.MaxAge)
	}
}
