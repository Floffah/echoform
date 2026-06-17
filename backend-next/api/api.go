package api

import _ "embed"

//go:embed api.v1.openapi.yaml
var V1ApiSpec []byte
