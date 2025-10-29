import { zValidator } from "@hono/zod-validator";
import { hash, verify } from "@node-rs/bcrypt";
import { addDays } from "date-fns";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { nanoid } from "nanoid";
import z from "zod";

import { db, userSessions, users } from "@/db";
import { TOKEN_LENGTH } from "@/lib/constants.ts";
import { emitPubsubMessage } from "@/lib/pubsub.ts";
import { rateLimit } from "@/lib/rateLimit.ts";

const app = new Hono();

// Apply rate limiting to authentication endpoints: 10 requests per 15 minutes
// Skip rate limiting during tests
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    keyPrefix: "auth-limit",
    skip: () => process.env.NODE_ENV === "test",
});

app.post(
    "/register",
    authRateLimit,
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
    zValidator(
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
    "/auth",
    authRateLimit,
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
    zValidator(
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

export default app;
