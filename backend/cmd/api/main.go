package main

import (
	"log/slog"
	"net/http"
	"os"

	"taskflow/internal/api"
	"taskflow/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	srv := api.New(cfg, nil) // store wired in a later task
	slog.Info("listening", "port", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, srv.Handler()); err != nil {
		slog.Error("server", "err", err)
		os.Exit(1)
	}
}
