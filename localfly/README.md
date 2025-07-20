# Localfly

This package simulates the [fly.io machines api](docs.machines.dev) locally using Bun and Docker

## Features

- ✅ **Apps Management**: Create and list applications
- ✅ **Machines API**: Full CRUD operations for machines
- ✅ **Docker Integration**: Creates real Docker containers for machines
- ✅ **Local Registry**: Built-in Docker registry for image management
- ✅ **Machine Lifecycle**: Start, stop, suspend machines
- ✅ **Database Persistence**: SQLite database for state management

## API Endpoints

### Apps
- `GET /v1/apps?org_slug=<org>` - List apps for organization
- `POST /v1/apps` - Create new app

### Machines
- `GET /v1/apps/{app_name}/machines` - List machines for app
- `POST /v1/apps/{app_name}/machines` - Create new machine
- `GET /v1/apps/{app_name}/machines/{machine_id}` - Get machine details
- `POST /v1/apps/{app_name}/machines/{machine_id}` - Update machine
- `DELETE /v1/apps/{app_name}/machines/{machine_id}` - Delete machine
- `POST /v1/apps/{app_name}/machines/{machine_id}/start` - Start machine
- `POST /v1/apps/{app_name}/machines/{machine_id}/stop` - Stop machine

### Registry
- `GET /v1/registry/status` - Get registry status
- `GET /v1/registry/images` - List images in local registry
- `POST /v1/registry/push` - Push image to local registry
- `POST /v1/registry/pull` - Pull image from local registry

## Installation

```bash
bun install
```

## Development

```bash
bun run dev
```

## Usage Examples

### Create an App
```bash
curl -X POST http://localhost:3000/v1/apps \
  -H "Content-Type: application/json" \
  -d '{"app_name":"my-app","org_slug":"my-org"}'
```

### Create a Machine
```bash
curl -X POST http://localhost:3000/v1/apps/my-app/machines \
  -H "Content-Type: application/json" \
  -d '{
    "name":"my-machine",
    "config":{
      "image":"nginx:alpine",
      "env":{"PORT":"80"}
    },
    "skip_launch":false
  }'
```

### List Machines
```bash
curl http://localhost:3000/v1/apps/my-app/machines
```

### Check Registry Status
```bash
curl http://localhost:3000/v1/registry/status
```

## Requirements

- Docker (for container management)
- Bun runtime

## Architecture

Localfly consists of:
1. **HTTP API Server** (Hono) - Handles Fly.io Machines API requests
2. **SQLite Database** - Stores app and machine metadata
3. **Docker Integration** - Creates and manages actual containers
4. **Local Registry** - Private Docker registry for image management

Each "machine" created through the API corresponds to a real Docker container, providing an accurate simulation of Fly.io's behavior for local development.

This project was created using `bun init` in bun v1.2.17. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
