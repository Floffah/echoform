package protocol

import (
	"encoding/json"
	"testing"
)

func TestDecodeServerboundHello(t *testing.T) {
	packet, err := DecodeServerbound([]byte(`{
		"id": "client.hello",
		"data": {
			"accessToken": "abcdefghijklmnopqrstuvwxyz123456",
			"clientVersion": "0.0.1",
			"device": "EchoformMMOGame/Godot"
		}
	}`))
	if err != nil {
		t.Fatal(err)
	}

	hello, ok := packet.(ClientHelloPacket)
	if !ok {
		t.Fatalf("got %T, want ClientHelloPacket", packet)
	}
	if hello.Data.AccessToken != "abcdefghijklmnopqrstuvwxyz123456" {
		t.Fatalf("unexpected access token %q", hello.Data.AccessToken)
	}
}

func TestDecodeServerboundReadyAllowsMissingData(t *testing.T) {
	packet, err := DecodeServerbound([]byte(`{"id":"client.ready"}`))
	if err != nil {
		t.Fatal(err)
	}

	if _, ok := packet.(ClientReadyPacket); !ok {
		t.Fatalf("got %T, want ClientReadyPacket", packet)
	}
}

func TestDecodeServerboundRejectsInvalidHello(t *testing.T) {
	_, err := DecodeServerbound([]byte(`{
		"id": "client.hello",
		"data": {
			"accessToken": "short",
			"clientVersion": "0.0.1",
			"device": "EchoformMMOGame/Godot"
		}
	}`))
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestEncodeClientboundWelcome(t *testing.T) {
	raw, err := EncodeClientbound(ServerWelcomePacket{
		Data: ServerWelcome{
			ConnectionId:  "connection-1",
			ServerVersion: "0.0.1",
			Environment:   ServerWelcomeEnvironmentDevelopment,
			FeatureFlags: []ServerWelcomeFeatureFlagsItem{
				ServerWelcomeFeatureFlagsItemEnableDebugMode,
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	var envelope Envelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.ID != PacketIDServerWelcome {
		t.Fatalf("got packet id %q, want %q", envelope.ID, PacketIDServerWelcome)
	}
}
