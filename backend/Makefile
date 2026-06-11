export DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/taskflow?sslmode=disable
export JWT_SECRET ?= dev-secret

.PHONY: dev test sqlc vet seed

dev:
	go run ./cmd/api

seed:
	go run ./cmd/seed

test:
	go vet ./...
	go test ./... -count=1

vet:
	go vet ./...

sqlc:
	sqlc generate
