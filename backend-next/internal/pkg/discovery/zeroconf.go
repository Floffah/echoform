package discovery

import (
	"fmt"
	"strconv"

	"github.com/grandcat/zeroconf"
)

const (
	echoformServiceName = "echoform"
	echoformServiceType = "_http._tcp"
	echoformDomain      = "local."
)

type ServiceConfig struct {
	Name   string
	Type   string
	Domain string
	Port   int
	Text   []string
}

type Service struct {
	server *zeroconf.Server
	config ServiceConfig
}

func EchoformHTTPConfig(port string, environment string) (ServiceConfig, error) {
	parsedPort, err := strconv.Atoi(port)
	if err != nil {
		return ServiceConfig{}, fmt.Errorf("parse discovery port %q: %w", port, err)
	}
	if parsedPort <= 0 || parsedPort > 65535 {
		return ServiceConfig{}, fmt.Errorf("discovery port %d is outside valid TCP port range", parsedPort)
	}

	return ServiceConfig{
		Name:   echoformServiceName,
		Type:   echoformServiceType,
		Domain: echoformDomain,
		Port:   parsedPort,
		Text: []string{
			"environment=" + environment,
			"app=echoform",
		},
	}, nil
}

func PublishEchoformHTTP(port string, environment string) (*Service, error) {
	config, err := EchoformHTTPConfig(port, environment)
	if err != nil {
		return nil, err
	}

	server, err := zeroconf.Register(config.Name, config.Type, config.Domain, config.Port, config.Text, nil)
	if err != nil {
		return nil, err
	}

	return &Service{
		server: server,
		config: config,
	}, nil
}

func (s *Service) Shutdown() {
	if s == nil || s.server == nil {
		return
	}
	s.server.Shutdown()
}

func (s *Service) Config() ServiceConfig {
	if s == nil {
		return ServiceConfig{}
	}
	return s.config
}
