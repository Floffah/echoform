set shell := ['nu', '-c']
set dotenv-load := true

mod backend

alias gen := generate

default:
	@just --list

build: backend::build
generate: backend::generate
test: backend::test
format: backend::format
dev: backend::dev
db-migrate: backend::db-migrate
db-rollback: backend::db-rollback

check: generate format test

docs-dev:
	bun run vitepress dev docs

docs-build:
	bun run vitepress build docs

docs-preview:
	bun run vitepress preview docs
