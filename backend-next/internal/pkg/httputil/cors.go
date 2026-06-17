package httputil

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type CorsConfig struct {
	AllowedOrigins []string
	AllowedMethods []string
	AllowedHeaders []string
	MaxAge         time.Duration
}

func CorsMiddleware(config CorsConfig) gin.HandlerFunc {
	allowedOrigins := make(map[string]struct{}, len(config.AllowedOrigins))
	for _, origin := range config.AllowedOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowedOrigins[origin] = struct{}{}
		}
	}

	allowedMethods := config.AllowedMethods
	if len(allowedMethods) == 0 {
		allowedMethods = []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPut,
			http.MethodPatch,
			http.MethodDelete,
			http.MethodOptions,
		}
	}

	allowedHeaders := config.AllowedHeaders
	if len(allowedHeaders) == 0 {
		allowedHeaders = []string{
			"Authorization",
			"Content-Type",
		}
	}

	maxAge := config.MaxAge
	if maxAge == 0 {
		maxAge = 12 * time.Hour
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			c.Next()
			return
		}

		c.Header("Vary", "Origin")

		if _, ok := allowedOrigins[origin]; !ok {
			if c.Request.Method == http.MethodOptions {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}

			c.Next()
			return
		}

		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Methods", strings.Join(allowedMethods, ", "))
		c.Header("Access-Control-Allow-Headers", strings.Join(allowedHeaders, ", "))
		c.Header("Access-Control-Max-Age", strconv.Itoa(int(maxAge.Seconds())))

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
