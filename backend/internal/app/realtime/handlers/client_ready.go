package handlers

import (
	"context"

	"github.com/floffah/echoform/backend-next/internal/app/realtime"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
)

func (h *Handler) HandleClientReady(ctx context.Context, session *realtime.Session, _ protocol.ClientReady) error {
	if !session.IsInPlay() {
		return nil
	}

	if session.ClientReady {
		return h.sendError(ctx, session, protocol.ServerErrorCodeClientAlreadyReady, "Client is already ready.", false)
	}

	session.ClientReady = true

	if session.User.Onboarded != nil && *session.User.Onboarded {
		return nil
	}

	if err := session.SetEnforcedState(ctx, protocol.ServerSetEnforcedStateNameCanHome, false); err != nil {
		return err
	}

	return session.Send(ctx, protocol.ServerForceScenePacket{
		Data: protocol.ServerForceScene{
			Scene: protocol.ServerForceSceneSceneIntro,
		},
	})
}
