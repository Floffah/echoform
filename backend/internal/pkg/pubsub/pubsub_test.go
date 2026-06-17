package pubsub

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"
)

func TestSessionInvalidationChannel(t *testing.T) {
	broker := Broker{environment: "development"}

	got := broker.sessionInvalidationChannel(42)
	want := "development:user_auth_invalidated:42"
	if got != want {
		t.Fatalf("channel = %q, want %q", got, want)
	}
}

func TestBrokerSessionInvalidationIntegration(t *testing.T) {
	rawURL := os.Getenv("VALKEY_TEST_URL")
	if rawURL == "" {
		t.Skip("VALKEY_TEST_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	broker, err := New(ctx, rawURL, "test")
	if err != nil {
		t.Fatal(err)
	}
	defer broker.Close()

	received := make(chan SessionInvalidation, 1)
	subscriptionErrors, err := broker.SubscribeSessionInvalidation(ctx, 42, func(invalidation SessionInvalidation) {
		received <- invalidation
	})
	if err != nil {
		t.Fatal(err)
	}

	want := SessionInvalidation{SessionID: 7}
	if err := broker.PublishSessionInvalidation(ctx, 42, want); err != nil {
		t.Fatal(err)
	}

	select {
	case got := <-received:
		if got != want {
			t.Fatalf("invalidation = %#v, want %#v", got, want)
		}
	case err := <-subscriptionErrors:
		t.Fatalf("subscription ended before message: %v", err)
	case <-ctx.Done():
		t.Fatal("timed out waiting for session invalidation")
	}

	cancel()
	if err := <-subscriptionErrors; err != nil && !errors.Is(err, context.Canceled) {
		t.Fatalf("stop subscription: %v", err)
	}
}
