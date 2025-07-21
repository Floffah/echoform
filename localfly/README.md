# LocalFly

This package simulates the [fly.io machines api](https://docs.machines.dev) locally using Bun and Docker.

LocalFly allows developers to test applications that use the fly.io machines API without incurring cloud costs. It provides a local Docker-based implementation that closely mirrors the real fly.io API.

## Features

- **Full Machines API**: Create, list, get, delete, start, stop machines
- **Apps Management**: Create and manage fly apps locally  
- **Volumes**: Create, list, extend, and delete volumes
- **Secrets**: Manage app secrets securely
- **Docker Integration**: Uses your local Docker daemon to run real containers
- **Event Logging**: Track machine lifecycle events
- **SQLite Database**: Persistent storage for apps, machines, volumes, and secrets
- **TypeScript**: Full type safety with generated fly.io API types

## Installation

```bash
bun install
```

## Usage

### Start the API Server

```bash
bun run start
```

The server will start on port 3000 (configurable via `PORT` environment variable).

### API Endpoints

#### Apps
- `GET /v1/apps?org_slug=<org>` - List apps for an organization
- `POST /v1/apps` - Create a new app
- `GET /v1/apps/<app>` - Get app details  
- `DELETE /v1/apps/<app>` - Delete an app

#### Machines
- `GET /v1/apps/<app>/machines` - List machines for an app
- `POST /v1/apps/<app>/machines` - Create a new machine
- `GET /v1/apps/<app>/machines/<id>` - Get machine details
- `DELETE /v1/apps/<app>/machines/<id>` - Delete a machine
- `GET /v1/apps/<app>/machines/<id>/events` - List machine events

#### Volumes
- `GET /v1/apps/<app>/volumes` - List volumes
- `POST /v1/apps/<app>/volumes` - Create a volume
- `GET /v1/apps/<app>/volumes/<id>` - Get volume details
- `DELETE /v1/apps/<app>/volumes/<id>` - Delete a volume
- `POST /v1/apps/<app>/volumes/<id>/extend` - Extend volume size

#### Secrets
- `GET /v1/apps/<app>/secrets` - List secrets
- `POST /v1/apps/<app>/secrets/<name>` - Set a secret
- `GET /v1/apps/<app>/secrets/<name>` - Get secret metadata
- `DELETE /v1/apps/<app>/secrets/<name>` - Delete a secret

### Example Usage

```bash
# Create an app
curl -X POST http://localhost:3000/v1/apps \
  -H "Content-Type: application/json" \
  -d '{"app_name": "my-app", "org_slug": "my-org"}'

# Create a machine
curl -X POST http://localhost:3000/v1/apps/my-app/machines \
  -H "Content-Type: application/json" \
  -d '{"config": {"image": "nginx:alpine"}, "region": "local"}'

# List machines
curl http://localhost:3000/v1/apps/my-app/machines
```

## Development

### Run in Development Mode

```bash
bun run dev
```

### Run Tests

```bash
bun test
```

### Linting

```bash
bun run lint
```

### Database Management

```bash
# Generate new migration
bun run db:generate

# Apply migrations  
bun run db:migrate
```

### Regenerate API Types

```bash
bun run generate
```

## Docker Integration

LocalFly uses your local Docker daemon to create and manage containers. Each machine corresponds to a real Docker container with:

- Labels for organization (`localfly.app`, `localfly.machine_id`, etc.)
- Proper lifecycle management (create, start, stop, remove)
- Automatic image pulling when needed
- Container grouping by app for easy identification

## Architecture

- **Hono**: Fast web framework for the API server
- **Drizzle ORM**: Type-safe database operations
- **SQLite**: Local database storage
- **Dockerode**: Docker API integration
- **TypeScript**: Full type safety throughout

## Configuration

Environment variables:

- `PORT`: Server port (default: 3000)
- `LOG_LEVEL`: Logging level (default: debug)
- `NODE_ENV`: Environment (production/development)

## Limitations

This is a local development tool and has some limitations compared to the real fly.io:

- No networking between machines
- No automatic scaling
- No geographic distribution
- Simplified volume management (no real persistent storage)
- No load balancing
- No TLS/SSL certificates

## Contributing

1. Make changes to the codebase
2. Run tests: `bun test`
3. Run linting: `bun run lint`
4. Ensure TypeScript compiles: `bunx tsc --noEmit`

This project was created using `bun init` in bun v1.2.17. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
