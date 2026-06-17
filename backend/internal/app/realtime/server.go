package realtime

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
	"github.com/gin-gonic/gin"
)

const (
	defaultAuthTimeout = 10 * time.Second
	defaultReadLimit   = 64 * 1024
)

type PacketHandler interface {
	Handle(context.Context, *Session, protocol.ServerboundPacket) error
}

type Server struct {
	handler        PacketHandler
	authTimeout    time.Duration
	originPatterns []string
}

type ServerOptions struct {
	AuthTimeout    time.Duration
	OriginPatterns []string
}

func NewServer(handler PacketHandler, options ServerOptions) *Server {
	authTimeout := options.AuthTimeout
	if authTimeout == 0 {
		authTimeout = defaultAuthTimeout
	}

	return &Server{
		handler:        handler,
		authTimeout:    authTimeout,
		originPatterns: options.OriginPatterns,
	}
}

func (s *Server) RegisterRoutes(router gin.IRouter) {
	router.GET("/client", s.HandleClient)
}

func (s *Server) HandleClient(c *gin.Context) {
	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		OriginPatterns: s.originPatterns,
	})
	if err != nil {
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(defaultReadLimit)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	connectionID, err := randomConnectionID()
	if err != nil {
		_ = conn.Close(websocket.StatusInternalError, "failed to create connection")
		return
	}

	var writeMu sync.Mutex
	session := NewSession(connectionID, func(ctx context.Context, packet protocol.ClientboundPacket) error {
		raw, err := protocol.EncodeClientbound(packet)
		if err != nil {
			return err
		}

		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.Write(ctx, websocket.MessageText, raw)
	})
	session.SetDisconnectFunc(func(_ context.Context, reason string) error {
		return conn.Close(websocket.StatusCode(4001), reason)
	})
	defer func() {
		session.State = StateClosed
	}()

	s.run(ctx, conn, session)
}

func (s *Server) run(ctx context.Context, conn *websocket.Conn, session *Session) {
	authDeadline := time.Now().Add(s.authTimeout)

	for {
		readCtx := ctx
		var cancel context.CancelFunc
		if session.State == StateLogin {
			readCtx, cancel = context.WithDeadline(ctx, authDeadline)
		}

		messageType, raw, err := conn.Read(readCtx)
		if cancel != nil {
			cancel()
		}
		if err != nil {
			if session.State == StateLogin && errors.Is(err, context.DeadlineExceeded) {
				_ = sendServerError(ctx, session, protocol.ServerErrorCodeAuthenticationTimeout, "Authentication timeout. Please reconnect.", true)
				_ = conn.Close(websocket.StatusPolicyViolation, "authentication timeout")
			}
			return
		}

		if messageType != websocket.MessageText {
			_ = sendServerError(ctx, session, protocol.ServerErrorCodeInvalidMessageFormat, "Invalid message format. Expected JSON text.", false)
			continue
		}

		packet, err := protocol.DecodeServerbound(raw)
		if err != nil {
			_ = sendServerError(ctx, session, protocol.ServerErrorCodeInvalidMessageFormat, err.Error(), false)
			continue
		}

		if err := s.handler.Handle(ctx, session, packet); err != nil {
			_ = sendServerError(ctx, session, protocol.ServerErrorCodeInternalError, "An error occurred while processing your request.", false)
			continue
		}
	}
}

func sendServerError(ctx context.Context, session *Session, code protocol.ServerErrorCode, message string, fatal bool) error {
	return session.Send(ctx, protocol.ServerErrorPacket{
		Data: protocol.ServerError{
			Code:    code,
			Fatal:   &fatal,
			Message: &message,
		},
	})
}

func randomConnectionID() (string, error) {
	data := make([]byte, 16)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}
