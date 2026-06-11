package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	DatabaseURL string
	JWTSecret   string
	Port        string
	Env         string // development | test | production
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL: getenv("DATABASE_URL", ""),
		JWTSecret:   getenv("JWT_SECRET", ""),
		Port:        getenv("PORT", "8080"),
		Env:         getenv("ENV", "development"),
	}
	if cfg.DatabaseURL == "" {
		return cfg, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return cfg, fmt.Errorf("JWT_SECRET is required")
	}
	return cfg, nil
}

func (c Config) IsProd() bool { return c.Env == "production" }

// getenv reads an env var, trimming whitespace — dashboards and copy-paste
// commonly introduce trailing newlines that break URL parsing.
func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
