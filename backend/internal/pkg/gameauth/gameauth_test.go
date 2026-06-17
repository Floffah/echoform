package gameauth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/floffah/echoform/backend-next/internal/pkg/db"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type fakeStore struct {
	users    map[int32]db.User
	sessions map[string]db.UserSession
}

func (s fakeStore) GetUserByID(ctx context.Context, id int32) (db.User, error) {
	user, ok := s.users[id]
	if !ok {
		return db.User{}, pgx.ErrNoRows
	}
	return user, nil
}

func (s fakeStore) GetUserSessionByAccessToken(ctx context.Context, accessToken string) (db.UserSession, error) {
	session, ok := s.sessions[accessToken]
	if !ok {
		return db.UserSession{}, pgx.ErrNoRows
	}
	return session, nil
}

func TestResolveAccessToken(t *testing.T) {
	now := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC)
	service := NewService(fakeStore{
		users: map[int32]db.User{
			42: {ID: 42, Name: "floffah"},
		},
		sessions: map[string]db.UserSession{
			"abcdefghijklmnopqrstuvwxyz123456": {
				ID:          7,
				UserID:      42,
				AccessToken: "abcdefghijklmnopqrstuvwxyz123456",
				ExpiresAt: pgtype.Timestamptz{
					Time:  now.Add(time.Hour),
					Valid: true,
				},
			},
		},
	}, Options{
		Now: func() time.Time { return now },
	})

	result, err := service.ResolveAccessToken(context.Background(), "abcdefghijklmnopqrstuvwxyz123456")
	if err != nil {
		t.Fatal(err)
	}
	if result.User.ID != 42 {
		t.Fatalf("user id = %d, want 42", result.User.ID)
	}
	if result.UserSession.ID != 7 {
		t.Fatalf("session id = %d, want 7", result.UserSession.ID)
	}
}

func TestResolveAccessTokenInvalid(t *testing.T) {
	service := NewService(fakeStore{}, Options{})

	_, err := service.ResolveAccessToken(context.Background(), "abcdefghijklmnopqrstuvwxyz123456")
	if !errors.Is(err, ErrInvalidAccessToken) {
		t.Fatalf("got %v, want ErrInvalidAccessToken", err)
	}
}

func TestResolveAccessTokenExpired(t *testing.T) {
	now := time.Date(2026, 6, 17, 12, 0, 0, 0, time.UTC)
	service := NewService(fakeStore{
		sessions: map[string]db.UserSession{
			"abcdefghijklmnopqrstuvwxyz123456": {
				ID:          7,
				UserID:      42,
				AccessToken: "abcdefghijklmnopqrstuvwxyz123456",
				ExpiresAt: pgtype.Timestamptz{
					Time:  now.Add(-time.Hour),
					Valid: true,
				},
			},
		},
	}, Options{
		Now: func() time.Time { return now },
	})

	_, err := service.ResolveAccessToken(context.Background(), "abcdefghijklmnopqrstuvwxyz123456")
	if !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("got %v, want ErrSessionExpired", err)
	}
}
