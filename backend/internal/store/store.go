package store

import (
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store bundles the sqlc-generated queries with the underlying pool
// (the pool is needed for the hand-built dynamic list query and transactions).
type Store struct {
	*Queries
	Pool *pgxpool.Pool
}

// NewStore is named to avoid clashing with the sqlc-generated New(DBTX).
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{Queries: New(pool), Pool: pool}
}
