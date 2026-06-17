package handlers

import (
	"context"
	"errors"
	"time"

	"github.com/floffah/echoform/backend-next/internal/app/realtime"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
	"github.com/floffah/echoform/backend-next/internal/pkg/gameauth"
	"github.com/floffah/echoform/backend-next/internal/pkg/pubsub"
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
	if h.invalidation == nil {
		return errors.New("session invalidation subscriber is required")
	}

	subscriptionErrors, err := h.invalidation.SubscribeSessionInvalidation(
		ctx,
		resolvedSession.User.ID,
		func(invalidation pubsub.SessionInvalidation) {
			if invalidation.SessionID != resolvedSession.UserSession.ID {
				return
			}
			go invalidateSession(session)
		},
	)
	if err != nil {
		return err
	}
	go disconnectOnSubscriptionFailure(ctx, session, subscriptionErrors)

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

func invalidateSession(session *realtime.Session) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_ = session.Send(ctx, protocol.ServerKickPacket{
		Data: protocol.ServerKick{Reason: protocol.ServerKickReasonSessionInvalidated},
	})
	_ = session.Disconnect(ctx, "session invalidated")
}

func disconnectOnSubscriptionFailure(ctx context.Context, session *realtime.Session, subscriptionErrors <-chan error) {
	select {
	case err, ok := <-subscriptionErrors:
		if !ok || err == nil || errors.Is(err, context.Canceled) {
			return
		}
		invalidateSession(session)
	case <-ctx.Done():
	}
}
