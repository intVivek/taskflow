package config

import (
	"fmt"
	"os"
)

type Config struct {
	DatabaseURL string
	JWTSecret   string
	Port        string
	Env         string // development | test | production
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
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

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
