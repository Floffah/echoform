package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/floffah/echoform/backend-next/internal/pkg/db"
	"github.com/floffah/echoform/backend-next/internal/pkg/pubsub"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"
)

const tokenLength = 32

func (s *Server) RegisterUser(ctx context.Context, request RegisterUserRequestObject) (RegisterUserResponseObject, error) {
	if request.Body == nil {
		return RegisterUser400JSONResponse{
			BadRequestJSONResponse: BadRequestJSONResponse{Error: "request body is required"},
		}, nil
	}

	username := strings.TrimSpace(request.Body.Username)
	if !validUsername(username) {
		return RegisterUser400JSONResponse{
			BadRequestJSONResponse: BadRequestJSONResponse{Error: "username must be between 1 and 20 characters"},
		}, nil
	}

	if !validPassword(request.Body.Password) {
		return RegisterUser400JSONResponse{
			BadRequestJSONResponse: BadRequestJSONResponse{Error: "password must be between 8 and 64 characters"},
		}, nil
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(request.Body.Password), bcrypt.DefaultCost)
	if err != nil {
		return RegisterUser500JSONResponse{
			InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to hash password"},
		}, nil
	}

	_, err = s.repository.CreateUser(ctx, db.CreateUserParams{
		Name:         username,
		PasswordHash: string(passwordHash),
	})
	if err != nil {
		if db.IsUniqueViolation(err) {
			return RegisterUser409JSONResponse{
				ConflictJSONResponse: ConflictJSONResponse{Error: "username already exists"},
			}, nil
		}

		return RegisterUser500JSONResponse{
			InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to create user"},
		}, nil
	}

	return RegisterUser201Response{}, nil
}

func (s *Server) AuthenticateUser(ctx context.Context, request AuthenticateUserRequestObject) (AuthenticateUserResponseObject, error) {
	if request.Body == nil {
		return AuthenticateUser400JSONResponse{
			BadRequestJSONResponse: BadRequestJSONResponse{Error: "request body is required"},
		}, nil
	}

	username := strings.TrimSpace(request.Body.Username)
	if !validUsername(username) || !validPassword(request.Body.Password) {
		return AuthenticateUser400JSONResponse{
			BadRequestJSONResponse: BadRequestJSONResponse{Error: "invalid username or password"},
		}, nil
	}

	user, err := s.repository.GetUserByName(ctx, username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return unauthorizedAuthenticateResponse(), nil
		}

		return AuthenticateUser500JSONResponse{
			InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to load user"},
		}, nil
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(request.Body.Password)); err != nil {
		return unauthorizedAuthenticateResponse(), nil
	}

	accessToken, err := randomToken(tokenLength)
	if err != nil {
		return AuthenticateUser500JSONResponse{
			InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to create access token"},
		}, nil
	}

	refreshToken, err := randomToken(tokenLength)
	if err != nil {
		return AuthenticateUser500JSONResponse{
			InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to create refresh token"},
		}, nil
	}

	now := time.Now()
	existingSessions, err := s.repository.ListUserSessionsByUserID(ctx, user.ID)
	if err != nil {
		return AuthenticateUser500JSONResponse{
			InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to load existing user sessions"},
		}, nil
	}

	for _, existingSession := range existingSessions {
		if s.invalidation == nil {
			return AuthenticateUser500JSONResponse{
				InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "session invalidation is unavailable"},
			}, nil
		}
		if err := s.invalidation.PublishSessionInvalidation(ctx, user.ID, pubsub.SessionInvalidation{SessionID: existingSession.ID}); err != nil {
			return AuthenticateUser500JSONResponse{
				InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to invalidate existing user sessions"},
			}, nil
		}
	}

	if err := s.repository.DeleteUserSessionsByUserID(ctx, user.ID); err != nil {
		return AuthenticateUser500JSONResponse{
			InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to reset user sessions"},
		}, nil
	}

	_, err = s.repository.CreateUserSession(ctx, db.CreateUserSessionParams{
		UserID:       user.ID,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresAt: pgtype.Timestamptz{
			Time:  now.Add(s.accessTokenTTL),
			Valid: true,
		},
		RefreshTokenExpiresAt: pgtype.Timestamptz{
			Time:  now.Add(s.refreshTokenTTL),
			Valid: true,
		},
	})
	if err != nil {
		return AuthenticateUser500JSONResponse{
			InternalServerErrorJSONResponse: InternalServerErrorJSONResponse{Error: "failed to create user session"},
		}, nil
	}

	return AuthenticateUser200JSONResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}

func validUsername(username string) bool {
	return len(username) >= 1 && len(username) <= 20
}

func validPassword(password string) bool {
	return len(password) >= 8 && len(password) <= 64
}

func unauthorizedAuthenticateResponse() AuthenticateUser401JSONResponse {
	return AuthenticateUser401JSONResponse{
		UnauthorizedJSONResponse: UnauthorizedJSONResponse{Error: "invalid username or password"},
	}
}

func randomToken(length int) (string, error) {
	byteCount := (length*6 + 7) / 8
	tokenBytes := make([]byte, byteCount)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(tokenBytes)[:length], nil
}
