package pubsub

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	valkey "github.com/valkey-io/valkey-go"
)

type SessionInvalidation struct {
	SessionID int32 `json:"sessionId"`
}

type Broker struct {
	client      valkey.Client
	environment string
}

func New(ctx context.Context, rawURL string, environment string) (*Broker, error) {
	options, err := valkey.ParseURL(rawURL)
	if err != nil {
		return nil, fmt.Errorf("parse Valkey URL: %w", err)
	}

	client, err := valkey.NewClient(options)
	if err != nil {
		return nil, fmt.Errorf("create Valkey client: %w", err)
	}

	if err := client.Do(ctx, client.B().Ping().Build()).Error(); err != nil {
		client.Close()
		return nil, fmt.Errorf("connect to Valkey: %w", err)
	}

	return &Broker{
		client:      client,
		environment: environment,
	}, nil
}

func (b *Broker) Close() {
	if b == nil || b.client == nil {
		return
	}
	b.client.Close()
}

func (b *Broker) PublishSessionInvalidation(ctx context.Context, userID int32, invalidation SessionInvalidation) error {
	payload, err := json.Marshal(invalidation)
	if err != nil {
		return fmt.Errorf("marshal session invalidation: %w", err)
	}

	channel := b.sessionInvalidationChannel(userID)
	if err := b.client.Do(ctx, b.client.B().Publish().Channel(channel).Message(string(payload)).Build()).Error(); err != nil {
		return fmt.Errorf("publish session invalidation: %w", err)
	}

	return nil
}

func (b *Broker) SubscribeSessionInvalidation(
	ctx context.Context,
	userID int32,
	handler func(SessionInvalidation),
) (<-chan error, error) {
	channel := b.sessionInvalidationChannel(userID)
	ready := make(chan struct{})
	done := make(chan error, 1)
	var readyOnce sync.Once

	subscriptionContext := valkey.WithOnSubscriptionHook(ctx, func(subscription valkey.PubSubSubscription) {
		if subscription.Kind == "subscribe" && subscription.Channel == channel {
			readyOnce.Do(func() { close(ready) })
		}
	})

	go func() {
		err := b.client.Receive(
			subscriptionContext,
			b.client.B().Subscribe().Channel(channel).Build(),
			func(message valkey.PubSubMessage) {
				var invalidation SessionInvalidation
				if err := json.Unmarshal([]byte(message.Message), &invalidation); err != nil {
					return
				}

				handler(invalidation)
			},
		)
		done <- err
		close(done)
	}()

	select {
	case <-ready:
		return done, nil
	case err := <-done:
		if err == nil {
			return nil, fmt.Errorf("subscribe to session invalidations: subscription ended")
		}
		return nil, fmt.Errorf("subscribe to session invalidations: %w", err)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (b *Broker) sessionInvalidationChannel(userID int32) string {
	return fmt.Sprintf("%s:user_auth_invalidated:%d", b.environment, userID)
}
