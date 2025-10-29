import { Scalar } from "@scalar/hono-api-reference";
import Bonjour from "bonjour-service";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { openAPIRouteHandler } from "hono-openapi";
import { upgradeWebSocket, websocket } from "hono/bun";
import { nanoid } from "nanoid";

import v1 from "@/endpoints/v1";
import { config } from "@/lib/config.ts";
import { performHealthCheck } from "@/lib/healthCheck.ts";
import { logger } from "@/lib/logger.ts";
import { startSessionCleanupJob } from "@/lib/sessionCleanup.ts";
import { GameClientConnection } from "@/protocol/GameClientConnection.ts";

logger.debug("Starting server...");

// Start session cleanup job with configured interval
if (process.env.NODE_ENV !== "test") {
    startSessionCleanupJob(config.SESSION_CLEANUP_INTERVAL_MS);
}

export const app = new Hono();

// Add compression middleware for all HTTP responses
app.use("*", compress());

app.get("/healthz", async (c) => {
    const health = await performHealthCheck();
    const statusCode = health.status === "ok" ? 200 : health.status === "degraded" ? 503 : 503;
    return c.json(health, statusCode);
});

app.get(
    "/client",
    upgradeWebSocket((c) => {
        const connectionId = nanoid();

        return new GameClientConnection(
            connectionId,
            new Headers(c.req.header()),
        );
    }),
);

app.route("/v1", v1);

const openapiServers = [
    {
        description: "Production server",
        url: "https://echoform.floffah.dev",
    },
];

if (process.env.NODE_ENV !== "production") {
    openapiServers.push({
        description: "Local server",
        url: "http://localhost:3000",
    });
}

app.get(
    "/openapi.json",
    async (c, next) => {
        if (process.env.NODE_ENV === "production") {
            return c.text("Unauthorized", 401);
        }

        return next();
    },
    openAPIRouteHandler(app, {
        documentation: {
            info: {
                title: "Echoform Authoritative Server",
                version: "0.0.0",
                description:
                    "This is the authoritative server for Echoform, a cozy MMORPG game.",
                license: {
                    name: "All rights reserved",
                },
                contact: {
                    name: "Floffah",
                    url: "https://floffah.dev/",
                },
            },
            servers: openapiServers,
            components: {
                securitySchemes: {
                    clientAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "token",
                    },
                    machineAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                },
            },
            security: [{ bearerAuth: [] }, { machineAuth: [] }],
        },
    }),
);

app.get(
    "/",
    Scalar({
        pageTitle: "Echoform Authoritative Server Reference",
        slug: "echoform-authoritative",
        url: "/openapi.json",
        theme: "deepSpace",
        baseServerURL: "https://echoform.floffah.dev",
        servers: openapiServers,
    }),
);

if (process.env.NODE_ENV === "development") {
    const bonjour = new Bonjour();

    const service = bonjour.publish({
        name: "echoform",
        type: "http",
        protocol: "tcp",
        port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
        txt: {
            environment: "development",
            app: "echoform",
        },
        host: "echoform._http._tcp.local.",
    });

    logger.debug(
        `Bonjour service published on host ${service.host} for development environment.`,
    );
}

export default {
    fetch: app.fetch,
    websocket,
};
