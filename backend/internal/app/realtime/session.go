package realtime

import (
	"context"
	"fmt"

	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
	"github.com/floffah/echoform/backend-next/internal/pkg/db"
)

type SendFunc func(context.Context, protocol.ClientboundPacket) error
type DisconnectFunc func(context.Context, string) error

type Session struct {
	ID          string
	State       State
	ClientReady bool

	User        *db.User
	UserSession *db.UserSession

	CachedEnforcedState map[protocol.ServerSetEnforcedStateName]bool

	send       SendFunc
	disconnect DisconnectFunc
}

func (s *Session) SetDisconnectFunc(disconnect DisconnectFunc) {
	s.disconnect = disconnect
}

func (s *Session) Disconnect(ctx context.Context, reason string) error {
	if s.disconnect == nil {
		return fmt.Errorf("session %q has no disconnect function", s.ID)
	}
	return s.disconnect(ctx, reason)
}

func NewSession(id string, send SendFunc) *Session {
	return &Session{
		ID:                  id,
		State:               StateLogin,
		CachedEnforcedState: map[protocol.ServerSetEnforcedStateName]bool{},
		send:                send,
	}
}

func (s *Session) Send(ctx context.Context, packet protocol.ClientboundPacket) error {
	if s.send == nil {
		return fmt.Errorf("session %q has no send function", s.ID)
	}
	return s.send(ctx, packet)
}

func (s *Session) MarkAuthenticated(user db.User, userSession db.UserSession) {
	s.User = &user
	s.UserSession = &userSession
	s.State = StatePlay
}

func (s *Session) IsInPlay() bool {
	return s.State == StatePlay && s.User != nil && s.UserSession != nil
}

func (s *Session) SetEnforcedState(ctx context.Context, name protocol.ServerSetEnforcedStateName, value bool) error {
	s.CachedEnforcedState[name] = value

	return s.Send(ctx, protocol.ServerSetEnforcedStatePacket{
		Data: protocol.ServerSetEnforcedState{
			Name:  name,
			Value: value,
		},
	})
}
