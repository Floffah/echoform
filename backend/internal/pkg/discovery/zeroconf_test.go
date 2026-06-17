package discovery

import "testing"

func TestEchoformHTTPConfig(t *testing.T) {
	config, err := EchoformHTTPConfig("8080", "development")
	if err != nil {
		t.Fatal(err)
	}

	if config.Name != "echoform" {
		t.Fatalf("name = %q, want echoform", config.Name)
	}
	if config.Type != "_http._tcp" {
		t.Fatalf("type = %q, want _http._tcp", config.Type)
	}
	if config.Domain != "local." {
		t.Fatalf("domain = %q, want local.", config.Domain)
	}
	if config.Port != 8080 {
		t.Fatalf("port = %d, want 8080", config.Port)
	}

	wantText := []string{"environment=development", "app=echoform"}
	if len(config.Text) != len(wantText) {
		t.Fatalf("text length = %d, want %d", len(config.Text), len(wantText))
	}
	for i, want := range wantText {
		if config.Text[i] != want {
			t.Fatalf("text[%d] = %q, want %q", i, config.Text[i], want)
		}
	}
}

func TestEchoformHTTPConfigRejectsInvalidPort(t *testing.T) {
	for _, port := range []string{"", "not-a-port", "0", "70000"} {
		t.Run(port, func(t *testing.T) {
			_, err := EchoformHTTPConfig(port, "development")
			if err == nil {
				t.Fatal("expected error")
			}
		})
	}
}
