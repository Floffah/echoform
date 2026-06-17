package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateCSharpProtocol(t *testing.T) {
	packets, err := loadPackets(filepath.Join("..", "..", "protocol", "schemas"))
	if err != nil {
		t.Fatal(err)
	}

	first, err := generateCSharp(packets)
	if err != nil {
		t.Fatal(err)
	}
	second, err := generateCSharp(packets)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("C# generation is not deterministic")
	}

	generated := string(first)
	for _, expected := range []string{
		`public const string ClientHello = "client.hello";`,
		`void Handle(ServerKickPacket packet);`,
		`ClientHelloPacket value => SerializeEnvelope(value.Id, value.Data),`,
		`PacketIds.ServerWelcome => new ServerWelcomePacket`,
		`[JsonConverter(typeof(JsonStringEnumConverter<ServerKickReason>))]`,
		`SESSION_INVALIDATED,`,
	} {
		if !strings.Contains(generated, expected) {
			t.Fatalf("generated C# does not contain %q", expected)
		}
	}

	if strings.Contains(generated, `PacketIds.ClientHello => new ClientHelloPacket`) {
		t.Fatal("serverbound packet was added to clientbound decoder")
	}
}

func TestCSharpEnumMemberRejectsInvalidIdentifier(t *testing.T) {
	if _, err := csharpEnumMember("not-valid"); err == nil {
		t.Fatal("invalid C# enum identifier was accepted")
	}
}
