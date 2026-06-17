package realtime

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
	"github.com/gin-gonic/gin"
)

type fakePacketHandler struct {
	handle func(context.Context, *Session, protocol.ServerboundPacket) error
}

func (h fakePacketHandler) Handle(ctx context.Context, session *Session, packet protocol.ServerboundPacket) error {
	return h.handle(ctx, session, packet)
}

func TestServerHandlesWebsocketPacket(t *testing.T) {
	gin.SetMode(gin.TestMode)

	realtimeServer := NewServer(fakePacketHandler{
		handle: func(ctx context.Context, session *Session, packet protocol.ServerboundPacket) error {
			if _, ok := packet.(protocol.ClientReadyPacket); !ok {
				t.Fatalf("packet = %T, want ClientReadyPacket", packet)
			}

			return session.Send(ctx, protocol.ServerWarningPacket{
				Data: protocol.ServerWarning{
					Code:    protocol.ServerWarningCodeMissingAccessToken,
					Message: "Missing access token. Please authenticate.",
				},
			})
		},
	}, ServerOptions{
		AuthTimeout: time.Second,
	})

	router := gin.New()
	realtimeServer.RegisterRoutes(router)
	httpServer := httptest.NewServer(router)
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, websocketURL(httpServer.URL)+"/client", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()

	raw, err := protocol.EncodeServerbound(protocol.ClientReadyPacket{Data: protocol.ClientReady{}})
	if err != nil {
		t.Fatal(err)
	}
	if err := conn.Write(ctx, websocket.MessageText, raw); err != nil {
		t.Fatal(err)
	}

	messageType, response, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if messageType != websocket.MessageText {
		t.Fatalf("message type = %s, want text", messageType)
	}

	packet, err := protocol.DecodeClientbound(response)
	if err != nil {
		t.Fatal(err)
	}

	warning, ok := packet.(protocol.ServerWarningPacket)
	if !ok {
		t.Fatalf("packet = %T, want ServerWarningPacket", packet)
	}
	if warning.Data.Code != protocol.ServerWarningCodeMissingAccessToken {
		t.Fatalf("warning code = %q, want %q", warning.Data.Code, protocol.ServerWarningCodeMissingAccessToken)
	}
}

func TestServerRejectsInvalidPacketFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)

	realtimeServer := NewServer(fakePacketHandler{
		handle: func(ctx context.Context, session *Session, packet protocol.ServerboundPacket) error {
			t.Fatal("handler should not be called for invalid packets")
			return nil
		},
	}, ServerOptions{
		AuthTimeout: time.Second,
	})

	router := gin.New()
	realtimeServer.RegisterRoutes(router)
	httpServer := httptest.NewServer(router)
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, websocketURL(httpServer.URL)+"/client", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()

	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"id":"client.hello","data":{"accessToken":"short"}}`)); err != nil {
		t.Fatal(err)
	}

	_, response, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}

	packet, err := protocol.DecodeClientbound(response)
	if err != nil {
		t.Fatal(err)
	}

	errorPacket, ok := packet.(protocol.ServerErrorPacket)
	if !ok {
		t.Fatalf("packet = %T, want ServerErrorPacket", packet)
	}
	if errorPacket.Data.Code != protocol.ServerErrorCodeInvalidMessageFormat {
		t.Fatalf("error code = %q, want %q", errorPacket.Data.Code, protocol.ServerErrorCodeInvalidMessageFormat)
	}
}

func websocketURL(httpURL string) string {
	return "ws" + strings.TrimPrefix(httpURL, "http")
}
