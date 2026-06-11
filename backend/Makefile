export DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/taskflow?sslmode=disable
export JWT_SECRET ?= dev-secret

.PHONY: dev test sqlc vet

dev:
	go run ./cmd/api

test:
	go test ./... -count=1

vet:
	go vet ./...

sqlc:
	sqlc generate
