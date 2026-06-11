package api

import (
	"context"

	"taskflow/internal/auth"
)

type ctxKey int

const claimsKey ctxKey = 0

func withClaims(ctx context.Context, c *auth.Claims) context.Context {
	return context.WithValue(ctx, claimsKey, c)
}

func claimsFrom(ctx context.Context) *auth.Claims {
	c, _ := ctx.Value(claimsKey).(*auth.Claims)
	return c
}
