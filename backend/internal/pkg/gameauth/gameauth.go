package gameauth

import (
	"context"
	"errors"
	"time"

	"github.com/floffah/echoform/backend-next/internal/pkg/db"
	"github.com/jackc/pgx/v5"
)

var (
	ErrInvalidAccessToken = errors.New("invalid access token")
	ErrSessionExpired     = errors.New("session expired")
)

type Store interface {
	GetUserByID(ctx context.Context, id int32) (db.User, error)
	GetUserSessionByAccessToken(ctx context.Context, accessToken string) (db.UserSession, error)
}

type AuthenticatedSession struct {
	User        db.User
	UserSession db.UserSession
}

type Service struct {
	store Store
	now   func() time.Time
}

type Options struct {
	Now func() time.Time
}

func NewService(store Store, options Options) *Service {
	now := options.Now
	if now == nil {
		now = time.Now
	}

	return &Service{
		store: store,
		now:   now,
	}
}

func (s *Service) ResolveAccessToken(ctx context.Context, accessToken string) (AuthenticatedSession, error) {
	userSession, err := s.store.GetUserSessionByAccessToken(ctx, accessToken)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AuthenticatedSession{}, ErrInvalidAccessToken
		}
		return AuthenticatedSession{}, err
	}

	if !userSession.ExpiresAt.Valid || userSession.ExpiresAt.Time.Before(s.now()) {
		return AuthenticatedSession{}, ErrSessionExpired
	}

	user, err := s.store.GetUserByID(ctx, userSession.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AuthenticatedSession{}, ErrInvalidAccessToken
		}
		return AuthenticatedSession{}, err
	}

	return AuthenticatedSession{
		User:        user,
		UserSession: userSession,
	}, nil
}
