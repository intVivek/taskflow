package api

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"taskflow/internal/auth"
)

// secureHeaders sets defense-in-depth headers on every response; nosniff
// matters most for the attachment download endpoint serving stored bytes.
func secureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic", "err", rec, "path", r.URL.Path, "stack", string(debug.Stack()))
				writeError(w, http.StatusInternalServerError, "internal", "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

const sessionCookieName = "taskflow_session"

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookieName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthenticated", "authentication required")
			return
		}
		claims, err := auth.VerifyToken([]byte(s.cfg.JWTSecret), c.Value)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthenticated", "invalid or expired session")
			return
		}
		next(w, r.WithContext(withClaims(r.Context(), claims)))
	}
}
