set shell := ['nu', '-c']
set dotenv-load := true

mod backend
mod game

alias gen := generate

default:
	@just --list

build: backend::build game::build
generate: backend::generate game::generate
test: backend::test game::test
format: backend::format game::format
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
