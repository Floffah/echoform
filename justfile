set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set dotenv-load := true

alias gen := generate

default:
	@just --list

[working-directory: 'backend-next']
build:
	go build -o build/api cmd/api/api.go

[working-directory: 'backend-next']
generate:
	go generate ./...

[working-directory: 'backend-next']
test:
	go test -v -cover ./...

[working-directory: 'backend-next']
format:
	go fmt ./...

check: generate format test

[working-directory: 'backend-next']
dev-api:
	go run cmd/api/api.go

[working-directory: 'backend-next']
db-migrate:
	TERN_MIGRATIONS=./data/migrations/ go tool tern migrate

[working-directory: 'backend-next']
db-rollback:
	TERN_MIGRATIONS=./data/migrations/ go tool tern migrate -d -1

docs-dev:
	bun run vitepress dev docs

docs-build:
	bun run vitepress build docs

docs-preview:
	bun run vitepress preview docs
