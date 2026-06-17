package handlers

import (
	"context"
	"errors"
	"testing"

	"github.com/floffah/echoform/backend-next/internal/app/realtime"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
	"github.com/floffah/echoform/backend-next/internal/pkg/db"
	"github.com/floffah/echoform/backend-next/internal/pkg/gameauth"
)

type fakeResolver struct {
	result gameauth.AuthenticatedSession
	err    error
}

func (r fakeResolver) ResolveAccessToken(ctx context.Context, accessToken string) (gameauth.AuthenticatedSession, error) {
	return r.result, r.err
}

func TestHandleClientHelloAuthenticatesAndSendsWelcome(t *testing.T) {
	sent := []protocol.ClientboundPacket{}
	session := realtime.NewSession("connection-1", func(ctx context.Context, packet protocol.ClientboundPacket) error {
		sent = append(sent, packet)
		return nil
	})

	handler := New(fakeResolver{
		result: gameauth.AuthenticatedSession{
			User:        db.User{ID: 42, Name: "floffah"},
			UserSession: db.UserSession{ID: 7, UserID: 42},
		},
	}, Options{
		ServerVersion: "0.0.1",
		Environment:   protocol.ServerWelcomeEnvironmentDevelopment,
	})

	err := handler.Handle(context.Background(), session, protocol.ClientHelloPacket{
		Data: protocol.ClientHello{
			AccessToken:   "abcdefghijklmnopqrstuvwxyz123456",
			ClientVersion: "0.0.1",
			Device:        "EchoformMMOGame/Godot",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !session.IsInPlay() {
		t.Fatal("session was not marked in play")
	}
	if len(sent) != 1 {
		t.Fatalf("sent %d packets, want 1", len(sent))
	}

	welcome, ok := sent[0].(protocol.ServerWelcomePacket)
	if !ok {
		t.Fatalf("sent %T, want ServerWelcomePacket", sent[0])
	}
	if welcome.Data.ConnectionId != "connection-1" {
		t.Fatalf("connection id = %q, want connection-1", welcome.Data.ConnectionId)
	}
}

func TestHandleClientHelloInvalidTokenSendsError(t *testing.T) {
	sent := []protocol.ClientboundPacket{}
	session := realtime.NewSession("connection-1", func(ctx context.Context, packet protocol.ClientboundPacket) error {
		sent = append(sent, packet)
		return nil
	})
	handler := New(fakeResolver{err: gameauth.ErrInvalidAccessToken}, Options{})

	err := handler.HandleClientHello(context.Background(), session, protocol.ClientHello{
		AccessToken:   "abcdefghijklmnopqrstuvwxyz123456",
		ClientVersion: "0.0.1",
		Device:        "EchoformMMOGame/Godot",
	})
	if err != nil {
		t.Fatal(err)
	}
	if session.IsInPlay() {
		t.Fatal("session should not be authenticated")
	}
	if len(sent) != 1 {
		t.Fatalf("sent %d packets, want 1", len(sent))
	}

	errorPacket, ok := sent[0].(protocol.ServerErrorPacket)
	if !ok {
		t.Fatalf("sent %T, want ServerErrorPacket", sent[0])
	}
	if errorPacket.Data.Code != protocol.ServerErrorCodeInvalidAccessToken {
		t.Fatalf("error code = %q, want %q", errorPacket.Data.Code, protocol.ServerErrorCodeInvalidAccessToken)
	}
}

func TestHandleClientHelloExpiredTokenSendsError(t *testing.T) {
	sent := []protocol.ClientboundPacket{}
	session := realtime.NewSession("connection-1", func(ctx context.Context, packet protocol.ClientboundPacket) error {
		sent = append(sent, packet)
		return nil
	})
	handler := New(fakeResolver{err: gameauth.ErrSessionExpired}, Options{})

	err := handler.HandleClientHello(context.Background(), session, protocol.ClientHello{
		AccessToken:   "abcdefghijklmnopqrstuvwxyz123456",
		ClientVersion: "0.0.1",
		Device:        "EchoformMMOGame/Godot",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(sent) != 1 {
		t.Fatalf("sent %d packets, want 1", len(sent))
	}

	errorPacket, ok := sent[0].(protocol.ServerErrorPacket)
	if !ok {
		t.Fatalf("sent %T, want ServerErrorPacket", sent[0])
	}
	if errorPacket.Data.Code != protocol.ServerErrorCodeSessionExpired {
		t.Fatalf("error code = %q, want %q", errorPacket.Data.Code, protocol.ServerErrorCodeSessionExpired)
	}
}

func TestHandleClientHelloReturnsUnexpectedResolverError(t *testing.T) {
	expectedErr := errors.New("database unavailable")
	handler := New(fakeResolver{err: expectedErr}, Options{})

	err := handler.HandleClientHello(context.Background(), realtime.NewSession("connection-1", nil), protocol.ClientHello{
		AccessToken:   "abcdefghijklmnopqrstuvwxyz123456",
		ClientVersion: "0.0.1",
		Device:        "EchoformMMOGame/Godot",
	})
	if !errors.Is(err, expectedErr) {
		t.Fatalf("got %v, want %v", err, expectedErr)
	}
}

func TestHandleClientReadyForNewUserSendsIntroFlow(t *testing.T) {
	sent := []protocol.ClientboundPacket{}
	session := realtime.NewSession("connection-1", func(ctx context.Context, packet protocol.ClientboundPacket) error {
		sent = append(sent, packet)
		return nil
	})
	session.MarkAuthenticated(db.User{ID: 42, Name: "floffah"}, db.UserSession{ID: 7, UserID: 42})

	handler := New(fakeResolver{}, Options{})
	if err := handler.HandleClientReady(context.Background(), session, protocol.ClientReady{}); err != nil {
		t.Fatal(err)
	}
	if !session.ClientReady {
		t.Fatal("session was not marked ready")
	}
	if len(sent) != 2 {
		t.Fatalf("sent %d packets, want 2", len(sent))
	}

	enforcedState, ok := sent[0].(protocol.ServerSetEnforcedStatePacket)
	if !ok {
		t.Fatalf("first packet = %T, want ServerSetEnforcedStatePacket", sent[0])
	}
	if enforcedState.Data.Name != protocol.ServerSetEnforcedStateNameCanHome || enforcedState.Data.Value {
		t.Fatalf("unexpected enforced state: %#v", enforcedState.Data)
	}

	forceScene, ok := sent[1].(protocol.ServerForceScenePacket)
	if !ok {
		t.Fatalf("second packet = %T, want ServerForceScenePacket", sent[1])
	}
	if forceScene.Data.Scene != protocol.ServerForceSceneSceneIntro {
		t.Fatalf("scene = %q, want %q", forceScene.Data.Scene, protocol.ServerForceSceneSceneIntro)
	}
}

func TestHandleClientReadyDuplicateSendsError(t *testing.T) {
	sent := []protocol.ClientboundPacket{}
	session := realtime.NewSession("connection-1", func(ctx context.Context, packet protocol.ClientboundPacket) error {
		sent = append(sent, packet)
		return nil
	})
	session.MarkAuthenticated(db.User{ID: 42, Name: "floffah"}, db.UserSession{ID: 7, UserID: 42})
	session.ClientReady = true

	handler := New(fakeResolver{}, Options{})
	if err := handler.HandleClientReady(context.Background(), session, protocol.ClientReady{}); err != nil {
		t.Fatal(err)
	}
	if len(sent) != 1 {
		t.Fatalf("sent %d packets, want 1", len(sent))
	}

	errorPacket, ok := sent[0].(protocol.ServerErrorPacket)
	if !ok {
		t.Fatalf("sent %T, want ServerErrorPacket", sent[0])
	}
	if errorPacket.Data.Code != protocol.ServerErrorCodeClientAlreadyReady {
		t.Fatalf("error code = %q, want %q", errorPacket.Data.Code, protocol.ServerErrorCodeClientAlreadyReady)
	}
}
