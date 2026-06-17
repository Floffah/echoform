package handlers

import (
	"context"
	"errors"

	"github.com/floffah/echoform/backend-next/internal/app/realtime"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
	"github.com/floffah/echoform/backend-next/internal/pkg/gameauth"
)

func (h *Handler) HandleClientHello(ctx context.Context, session *realtime.Session, data protocol.ClientHello) error {
	if h.resolver == nil {
		return errors.New("session resolver is required")
	}

	resolvedSession, err := h.resolver.ResolveAccessToken(ctx, data.AccessToken)
	if err != nil {
		if errors.Is(err, gameauth.ErrInvalidAccessToken) {
			return h.sendError(ctx, session, protocol.ServerErrorCodeInvalidAccessToken, "Invalid access token.", false)
		}
		if errors.Is(err, gameauth.ErrSessionExpired) {
			return h.sendError(ctx, session, protocol.ServerErrorCodeSessionExpired, "Access token has expired.", false)
		}
		return err
	}

	session.MarkAuthenticated(resolvedSession.User, resolvedSession.UserSession)

	return session.Send(ctx, protocol.ServerWelcomePacket{
		Data: protocol.ServerWelcome{
			ConnectionId:  session.ID,
			Environment:   h.environment,
			FeatureFlags:  h.featureFlags,
			ServerVersion: h.serverVersion,
		},
	})
}
