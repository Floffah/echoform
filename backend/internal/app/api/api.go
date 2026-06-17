package api

import (
	"context"
	"net/http"
	"time"

	backendnext "github.com/floffah/echoform/backend-next"
	spec "github.com/floffah/echoform/backend-next/api"
	"github.com/floffah/echoform/backend-next/internal/app/realtime"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/handlers"
	"github.com/floffah/echoform/backend-next/internal/app/realtime/protocol"
	"github.com/floffah/echoform/backend-next/internal/pkg/db"
	"github.com/floffah/echoform/backend-next/internal/pkg/gameauth"
	"github.com/floffah/echoform/backend-next/internal/pkg/httputil"
	"github.com/floffah/echoform/backend-next/internal/pkg/pubsub"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:generate go tool github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen -config cfg.yaml ../../../api/api.v1.openapi.yaml

type Server struct {
	repository      db.Queries
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
	invalidation    SessionInvalidationBroker
}

type SessionInvalidationBroker interface {
	PublishSessionInvalidation(context.Context, int32, pubsub.SessionInvalidation) error
	SubscribeSessionInvalidation(context.Context, int32, func(pubsub.SessionInvalidation)) (<-chan error, error)
}

type ServerDeps struct {
	DB                 db.DBTX
	CORSAllowedOrigins []string
	AccessTokenTTL     time.Duration
	RefreshTokenTTL    time.Duration
	AuthTimeout        time.Duration
	Mode               string
	Invalidation       SessionInvalidationBroker
}

func NewServer(
	conn *pgxpool.Pool,
	corsAllowedOrigins []string,
	accessTokenTTL time.Duration,
	refreshTokenTTL time.Duration,
	authTimeout time.Duration,
	mode string,
	port string,
	invalidation SessionInvalidationBroker,
) (*http.Server, error) {
	r := NewRouter(ServerDeps{
		DB:                 conn,
		CORSAllowedOrigins: corsAllowedOrigins,
		AccessTokenTTL:     accessTokenTTL,
		RefreshTokenTTL:    refreshTokenTTL,
		AuthTimeout:        authTimeout,
		Mode:               mode,
		Invalidation:       invalidation,
	})

	s := &http.Server{
		Handler:           r,
		Addr:              "0.0.0.0:" + port,
		ReadHeaderTimeout: 5 * time.Second,
	}

	return s, nil
}

func NewRouter(deps ServerDeps) *gin.Engine {
	server := Server{
		repository:      *db.New(deps.DB),
		accessTokenTTL:  deps.AccessTokenTTL,
		refreshTokenTTL: deps.RefreshTokenTTL,
		invalidation:    deps.Invalidation,
	}
	repository := db.New(deps.DB)
	authService := gameauth.NewService(repository, gameauth.Options{})
	realtimeHandler := handlers.New(authService, handlers.Options{
		ServerVersion: backendnext.Version,
		Environment:   protocolEnvironment(deps.Mode),
		FeatureFlags:  featureFlagsForMode(deps.Mode),
		Invalidation:  deps.Invalidation,
	})
	realtimeServer := realtime.NewServer(realtimeHandler, realtime.ServerOptions{
		AuthTimeout: deps.AuthTimeout,
	})
	strictServer := NewStrictHandlerWithOptions(&server, []StrictMiddlewareFunc{}, StrictGinServerOptions{
		RequestErrorHandlerFunc: func(ctx *gin.Context, err error) {
			ctx.JSON(http.StatusBadRequest, ErrorResponse{Error: err.Error()})
		},
		HandlerErrorFunc: func(ctx *gin.Context, err error) {
			ctx.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		},
		ResponseErrorHandlerFunc: func(ctx *gin.Context, err error) {
			ctx.JSON(http.StatusInternalServerError, ErrorResponse{Error: err.Error()})
		},
	})

	r := gin.Default()
	r.Use(httputil.CorsMiddleware(httputil.CorsConfig{
		AllowedOrigins: deps.CORSAllowedOrigins,
	}))
	r.GET("/openapi.yaml", func(c *gin.Context) {
		c.Data(http.StatusOK, "application/yaml", spec.V1ApiSpec)
	})

	RegisterHandlers(r, strictServer)
	realtimeServer.RegisterRoutes(r)

	return r
}

func (s *Server) Healthz(ctx context.Context, request HealthzRequestObject) (HealthzResponseObject, error) {
	return Healthz200JSONResponse{Status: "ok"}, nil
}

func (s *Server) Version(ctx context.Context, request VersionRequestObject) (VersionResponseObject, error) {
	return Version200JSONResponse{
		Commit:  backendnext.Commit,
		Version: backendnext.Version,
	}, nil
}

func protocolEnvironment(mode string) protocol.ServerWelcomeEnvironment {
	if mode == "production" {
		return protocol.ServerWelcomeEnvironmentProduction
	}
	return protocol.ServerWelcomeEnvironmentDevelopment
}

func featureFlagsForMode(mode string) []protocol.ServerWelcomeFeatureFlagsItem {
	if mode == "production" {
		return []protocol.ServerWelcomeFeatureFlagsItem{}
	}

	return []protocol.ServerWelcomeFeatureFlagsItem{
		protocol.ServerWelcomeFeatureFlagsItemEnableDebugMode,
		protocol.ServerWelcomeFeatureFlagsItemEnableExperimentalFeatures,
	}
}
