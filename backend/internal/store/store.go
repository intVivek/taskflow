package store

import (
	"context"

	"github.com/jackc/pgx/v5"
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

// InTx runs fn with a Queries bound to a transaction.
// If fn returns an error the transaction is rolled back; otherwise committed.
func (s *Store) InTx(ctx context.Context, fn func(q *Queries) error) error {
	return pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		return fn(s.Queries.WithTx(tx))
	})
}
