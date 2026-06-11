package api

import (
	"net/http"

	"taskflow/internal/config"
	"taskflow/internal/store"
)

type Server struct {
	cfg config.Config
	st  *store.Store
	mux *http.ServeMux
}

func New(cfg config.Config, st *store.Store) *Server {
	s := &Server{cfg: cfg, st: st, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return recoverPanic(s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
}
