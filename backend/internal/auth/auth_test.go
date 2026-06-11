package auth_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"taskflow/internal/auth"
)

func TestPasswordHashing(t *testing.T) {
	hash, err := auth.HashPassword("s3cret-pass")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "s3cret-pass" {
		t.Fatal("hash equals plaintext")
	}
	if !auth.CheckPassword(hash, "s3cret-pass") {
		t.Fatal("correct password rejected")
	}
	if auth.CheckPassword(hash, "wrong") {
		t.Fatal("wrong password accepted")
	}
}

func TestJWTRoundTrip(t *testing.T) {
	secret := []byte("test-secret")
	id := uuid.New()
	tok, err := auth.MintToken(secret, id, "admin", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := auth.VerifyToken(secret, tok)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != id || claims.Role != "admin" {
		t.Fatalf("claims mismatch: %+v", claims)
	}
}

func TestJWTRejects(t *testing.T) {
	secret := []byte("test-secret")
	id := uuid.New()

	tok, _ := auth.MintToken(secret, id, "user", -time.Minute) // already expired
	if _, err := auth.VerifyToken(secret, tok); err == nil {
		t.Fatal("expired token accepted")
	}

	tok2, _ := auth.MintToken([]byte("other-secret"), id, "user", time.Hour)
	if _, err := auth.VerifyToken(secret, tok2); err == nil {
		t.Fatal("token with wrong secret accepted")
	}
}
