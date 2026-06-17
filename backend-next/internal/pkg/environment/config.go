package environment

import (
	"time"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Mode               string        `env:"ENVIRONMENT" envDefault:"development"`
	Port               string        `env:"PORT" envDefault:"8080"`
	DatabaseURL        string        `env:"DATABASE_URL,required"`
	CORSAllowedOrigins []string      `env:"CORS_ALLOWED_ORIGINS" envDefault:"http://localhost:3000,http://127.0.0.1:3000"`
	AccessTokenTTL     time.Duration `env:"ACCESS_TOKEN_TTL" envDefault:"720h"`
	RefreshTokenTTL    time.Duration `env:"REFRESH_TOKEN_TTL" envDefault:"2160h"`
	AuthTimeout        time.Duration `env:"AUTH_TIMEOUT" envDefault:"10s"`
}

func LoadConfig() (Config, error) {
	var cfg Config
	err := env.Parse(&cfg)
	if err != nil {
		return Config{}, err
	}
	return cfg, nil
}
