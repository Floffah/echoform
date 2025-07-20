import { hash, verify } from "@node-rs/bcrypt";
import { Scalar } from "@scalar/hono-api-reference";
import { redis } from "bun";
import { addDays } from "date-fns";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, openAPISpecs } from "hono-openapi";
import { resolver, validator } from "hono-openapi/zod";
import { createBunWebSocket } from "hono/bun";
import { nanoid } from "nanoid";
import z from "zod";

import { db, userSessions, users } from "@/db";
import { TOKEN_LENGTH } from "@/lib/constants.ts";
import { logger } from "@/lib/logger.ts";
import {
    type PubsubMessages,
    emitPubsubMessage,
    pubsubChannel,
} from "@/lib/pubsub.ts";
import { GameClientConnection } from "@/protocol/GameClientConnection.ts";

logger.debug("Starting server...");

export const app = new Hono();

const { upgradeWebSocket, websocket } = createBunWebSocket();

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

app.post(
    "/v1/user/register",
    describeRoute({
        operationId: "registerUser",
        summary: "Register a new user",
        tags: ["v1"],
        responses: {
            201: {
                description: "User registered successfully",
            },
            409: {
                description: "Data conflict",
                content: {
                    "application/json": {
                        schema: resolver(
                            z.object({
                                error: z.string().describe("Error message"),
                            }),
                        ),
                    },
                },
            },
        },
    }),
    validator(
        "json",
        z.object({
            username: z.string().min(1).max(20),
            password: z.string().min(8).max(64),
        }),
    ),
    async (c) => {
        const body = c.req.valid("json");

        const result = await db
            .insert(users)
            .values({
                name: body.username,
                passwordHash: await hash(body.password),
            })
            .onConflictDoNothing({ target: users.name });

        if (result.rowCount === 0) {
            return c.json({ error: "Username already exists" }, 409);
        }

        return c.body(null, 201);
    },
);

export const v1UserAuth202Response = z.object({
    accessToken: z.string().describe("Access token for the user"),
    refreshToken: z.string().describe("Refresh token for the user"),
});

app.post(
    "/v1/user/auth",
    describeRoute({
        operationId: "authenticateUser",
        summary: "Authenticate a user",
        tags: ["v1"],
        responses: {
            200: {
                description: "User authenticated successfully",
                content: {
                    "application/json": {
                        schema: resolver(v1UserAuth202Response),
                    },
                },
            },
            401: {
                description: "Unauthorized",
            },
        },
    }),
    validator(
        "json",
        z.object({
            username: z.string().min(1).max(20),
            password: z.string().min(8).max(64),
        }),
    ),
    async (c) => {
        const body = c.req.valid("json");

        const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.name, body.username),
        });

        if (!user) {
            return c.json({ message: "Invalid username or password" }, 401);
        }

        const isPasswordValid = await verify(body.password, user.passwordHash);
        if (!isPasswordValid) {
            return c.json({ message: "Invalid username or password" }, 401);
        }

        const accessToken = nanoid(TOKEN_LENGTH);
        const refreshToken = nanoid(TOKEN_LENGTH);

        const expiresAt = addDays(new Date(), 30);
        const refreshTokenExpiresAt = addDays(new Date(), 90);

        const existingSessions = await db.query.userSessions.findMany({
            where: (userSessions, { eq }) => eq(userSessions.userId, user.id),
        });

        for (const session of existingSessions) {
            await emitPubsubMessage("user_auth_invalidated", user.id, {
                sessionId: session.id,
            });
        }

        await db.delete(userSessions).where(eq(userSessions.userId, user.id));

        await db
            .insert(userSessions)
            .values({
                userId: user.id,
                accessToken,
                refreshToken,
                expiresAt,
                refreshTokenExpiresAt,
            })
            .onConflictDoUpdate({
                target: userSessions.accessToken,
                set: {
                    refreshToken,
                },
            });

        return c.json({
            accessToken,
            refreshToken,
        });
    },
);

app.get(
    "/v1/cosmetics",
    describeRoute({
        operationId: "getCosmetics",
        summary: "Get all available cosmetics",
        tags: ["v1"],
        responses: {
            200: {
                description: "List of available cosmetics",
                content: {
                    "application/json": {
                        schema: resolver(
                            z.array(
                                z.object({
                                    id: z.number(),
                                    type: z.string(),
                                    slot: z.string(),
                                    name: z.string(),
                                    description: z.string().nullable(),
                                }),
                            ),
                        ),
                    },
                },
            },
        },
    }),
    async (c) => {
        const allCosmetics = await db.query.cosmetics.findMany();
        return c.json(allCosmetics);
    },
);

app.get(
    "/v1/user/cosmetics",
    describeRoute({
        operationId: "getUserCosmetics",
        summary: "Get user cosmetics",
        tags: ["v1"],
        responses: {
            200: {
                description: "User cosmetics",
                content: {
                    "application/json": {
                        schema: resolver(
                            z.array(
                                z.object({
                                    id: z.number(),
                                    userId: z.number(),
                                    cosmeticId: z.number(),
                                    owned: z.boolean(),
                                    equipped: z.boolean(),
                                }),
                            ),
                        ),
                    },
                },
            },
            401: {
                description: "Unauthorized",
            },
        },
    }),
    async (c) => {
        const bearerAuth = c.req.header("Authorization");

        if (!bearerAuth) {
            return c.json({ error: "Missing authorization header" }, 401);
        }

        const [scheme, token] = bearerAuth.split(" ");

        if (scheme?.toLowerCase() !== "bearer") {
            return c.json({ error: "Invalid authorization scheme" }, 401);
        }

        if (!token) {
            return c.json({ error: "Missing token" }, 401);
        }

        const userSession = await db.query.userSessions.findFirst({
            where: (userSessions, { eq, and, gt }) =>
                and(
                    eq(userSessions.accessToken, token),
                    gt(userSessions.expiresAt, new Date()),
                ),
        });

        if (!userSession) {
            return c.json({ error: "Invalid or expired token" }, 401);
        }

        const userCosmetics = await db.query.userCosmetics.findMany({
            where: (userCosmetics, { eq }) =>
                eq(userCosmetics.userId, userSession.userId),
        });

        return c.json(userCosmetics);
    },
);

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
            const bearerAuth = c.req.header("Authorization");

            if (!bearerAuth) {
                return c.json({ error: "Missing authorization header" }, 401);
            }

            const [scheme, token] = bearerAuth.split(" ");

            if (scheme?.toLowerCase() !== "bearer") {
                return c.json({ error: "Invalid authorization scheme" }, 401);
            }

            if (!token) {
                return c.json({ error: "Missing token" }, 401);
            }

            const userSession = await db.query.userSessions.findFirst({
                where: (userSessions, { eq, and, gt }) =>
                    and(
                        eq(userSessions.accessToken, token),
                        gt(userSessions.expiresAt, new Date()),
                    ),
            });

            if (!userSession) {
                return c.json({ error: "Invalid or expired token" }, 401);
            }
        }

        return next();
    },
    openAPISpecs(app, {
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
