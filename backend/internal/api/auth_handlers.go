package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"taskflow/internal/auth"
	"taskflow/internal/store"
)

const sessionTTL = 7 * 24 * time.Hour

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (c *credentials) validate() map[string]string {
	fields := map[string]string{}
	c.Email = strings.TrimSpace(c.Email)
	if !emailRe.MatchString(c.Email) {
		fields["email"] = "must be a valid email address"
	}
	if len(c.Password) < 8 || len(c.Password) > 72 {
		fields["password"] = "must be between 8 and 72 characters"
	}
	if len(fields) == 0 {
		return nil
	}
	return fields
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid JSON body")
		return false
	}
	return true
}

func (s *Server) setSession(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   s.cfg.IsProd(),
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var creds credentials
	if !decodeBody(w, r, &creds) {
		return
	}
	if fields := creds.validate(); fields != nil {
		writeValidationError(w, fields)
		return
	}
	hash, err := auth.HashPassword(creds.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create account")
		return
	}
	u, err := s.st.CreateUser(r.Context(), store.CreateUserParams{Email: creds.Email, PasswordHash: hash})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "email_taken", "an account with this email already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create account")
		return
	}
	tok, err := auth.MintToken([]byte(s.cfg.JWTSecret), u.ID, u.Role, sessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create session")
		return
	}
	s.setSession(w, tok, int(sessionTTL.Seconds()))
	writeJSON(w, http.StatusCreated, u)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var creds credentials
	if !decodeBody(w, r, &creds) {
		return
	}
	u, err := s.st.GetUserByEmail(r.Context(), strings.TrimSpace(creds.Email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			auth.DummyCompare()
			writeError(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not log in")
		return
	}
	if !auth.CheckPassword(u.PasswordHash, creds.Password) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
		return
	}
	tok, err := auth.MintToken([]byte(s.cfg.JWTSecret), u.ID, u.Role, sessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create session")
		return
	}
	s.setSession(w, tok, int(sessionTTL.Seconds()))
	writeJSON(w, http.StatusOK, map[string]any{
		"id": u.ID, "email": u.Email, "role": u.Role, "created_at": u.CreatedAt,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.setSession(w, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	u, err := s.st.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "account no longer exists")
		return
	}
	writeJSON(w, http.StatusOK, u)
}
