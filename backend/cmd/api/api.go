package main

import (
	"context"
	"log"

	"github.com/floffah/echoform/backend-next/internal/app/api"
	"github.com/floffah/echoform/backend-next/internal/pkg/db"
	"github.com/floffah/echoform/backend-next/internal/pkg/discovery"
	"github.com/floffah/echoform/backend-next/internal/pkg/environment"
	"github.com/floffah/echoform/backend-next/internal/pkg/pubsub"
	"github.com/gin-gonic/gin"
)

func main() {
	env, err := environment.LoadEnvironment()
	if err != nil {
		log.Fatal(err)
	}

	ginMode := "debug"
	if env.Config.Mode == "production" {
		ginMode = "release"
	}
	gin.SetMode(ginMode)

	conn, err := db.Connect(context.Background(), env.Config.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	invalidationBroker, err := pubsub.New(context.Background(), env.Config.ValkeyURL, env.Config.Mode)
	if err != nil {
		log.Fatal(err)
	}
	defer invalidationBroker.Close()

	server, err := api.NewServer(
		conn,
		env.Config.CORSAllowedOrigins,
		env.Config.AccessTokenTTL,
		env.Config.RefreshTokenTTL,
		env.Config.AuthTimeout,
		env.Config.Mode,
		env.Config.Port,
		invalidationBroker,
	)
	if err != nil {
		log.Fatal(err)
	}

	if env.Config.Mode != "production" {
		service, err := discovery.PublishEchoformHTTP(env.Config.Port, env.Config.Mode)
		if err != nil {
			log.Printf("failed to publish Echoform Zeroconf service: %v", err)
		} else {
			defer service.Shutdown()
			log.Printf("published Echoform Zeroconf service %s.%s on port %d", service.Config().Name, service.Config().Type, service.Config().Port)
		}
	}

	log.Fatal(server.ListenAndServe())
}
