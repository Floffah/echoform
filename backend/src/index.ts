import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { upgradeWebSocket, websocket } from "hono/bun";
import { nanoid } from "nanoid";

import v1 from "@/endpoints/v1";
import { logger } from "@/lib/logger.ts";
import { GameClientConnection } from "@/protocol/GameClientConnection.ts";

if (process.env.NODE_ENV === "development") {
    await import("../scripts/asyncapi");
}

logger.debug("Starting server...");

export const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok" }));

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

export default {
    fetch: app.fetch,
    websocket,
};
