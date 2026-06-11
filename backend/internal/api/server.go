package api

import (
	"net/http"

	"taskflow/internal/config"
	"taskflow/internal/events"
	"taskflow/internal/store"
)

type Server struct {
	cfg config.Config
	st  *store.Store
	hub *events.Hub
	mux *http.ServeMux
}

func New(cfg config.Config, st *store.Store, hub *events.Hub) *Server {
	s := &Server{cfg: cfg, st: st, hub: hub, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return secureHeaders(recoverPanic(s.mux))
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	s.mux.HandleFunc("POST /auth/signup", s.handleSignup)
	s.mux.HandleFunc("POST /auth/login", s.handleLogin)
	s.mux.HandleFunc("POST /auth/logout", s.requireAuth(s.handleLogout))
	s.mux.HandleFunc("GET /auth/me", s.requireAuth(s.handleMe))

	s.mux.HandleFunc("POST /tasks", s.requireAuth(s.handleCreateTask))
	s.mux.HandleFunc("GET /tasks", s.requireAuth(s.handleListTasks))
	s.mux.HandleFunc("GET /tasks/{id}", s.requireAuth(s.handleGetTask))
	s.mux.HandleFunc("PATCH /tasks/{id}", s.requireAuth(s.handleUpdateTask))
	s.mux.HandleFunc("DELETE /tasks/{id}", s.requireAuth(s.handleDeleteTask))
	s.mux.HandleFunc("GET /tasks/{id}/activity", s.requireAuth(s.handleListActivity))

	s.mux.HandleFunc("POST /tasks/{id}/attachments", s.requireAuth(s.handleUploadAttachment))
	s.mux.HandleFunc("GET /tasks/{id}/attachments", s.requireAuth(s.handleListAttachments))
	s.mux.HandleFunc("GET /attachments/{id}", s.requireAuth(s.handleDownloadAttachment))
	s.mux.HandleFunc("DELETE /attachments/{id}", s.requireAuth(s.handleDeleteAttachment))

	s.mux.HandleFunc("GET /events", s.requireAuth(s.handleEvents))
}
