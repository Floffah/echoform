package handlers

import (
	"context"
	"fmt"

	"github.com/floffah/echoform/backend-next/internal/app/realtime"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
	"github.com/floffah/echoform/backend-next/internal/pkg/gameauth"
	"github.com/floffah/echoform/backend-next/internal/pkg/pubsub"
)

type SessionResolver interface {
	ResolveAccessToken(ctx context.Context, accessToken string) (gameauth.AuthenticatedSession, error)
}

type SessionInvalidationSubscriber interface {
	SubscribeSessionInvalidation(context.Context, int32, func(pubsub.SessionInvalidation)) (<-chan error, error)
}

type Handler struct {
	resolver      SessionResolver
	serverVersion string
	environment   protocol.ServerWelcomeEnvironment
	featureFlags  []protocol.ServerWelcomeFeatureFlagsItem
	invalidation  SessionInvalidationSubscriber
}

type Options struct {
	ServerVersion string
	Environment   protocol.ServerWelcomeEnvironment
	FeatureFlags  []protocol.ServerWelcomeFeatureFlagsItem
	Invalidation  SessionInvalidationSubscriber
}

func New(resolver SessionResolver, options Options) *Handler {
	serverVersion := options.ServerVersion
	if serverVersion == "" {
		serverVersion = "unknown"
	}

	environment := options.Environment
	if environment == "" {
		environment = protocol.ServerWelcomeEnvironmentDevelopment
	}

	featureFlags := options.FeatureFlags
	if featureFlags == nil {
		featureFlags = []protocol.ServerWelcomeFeatureFlagsItem{}
	}

	return &Handler{
		resolver:      resolver,
		serverVersion: serverVersion,
		environment:   environment,
		featureFlags:  featureFlags,
		invalidation:  options.Invalidation,
	}
}

func (h *Handler) Handle(ctx context.Context, session *realtime.Session, packet protocol.ServerboundPacket) error {
	switch packet := packet.(type) {
	case protocol.ClientHelloPacket:
		return h.HandleClientHello(ctx, session, packet.Data)
	case protocol.ClientReadyPacket:
		return h.HandleClientReady(ctx, session, packet.Data)
	default:
		return fmt.Errorf("unhandled serverbound packet %q", packet.ID())
	}
}

func (h *Handler) sendError(ctx context.Context, session *realtime.Session, code protocol.ServerErrorCode, message string, fatal bool) error {
	return session.Send(ctx, protocol.ServerErrorPacket{
		Data: protocol.ServerError{
			Code:    code,
			Fatal:   &fatal,
			Message: &message,
		},
	})
}
