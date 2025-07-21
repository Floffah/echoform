import { Hono } from "hono";
import { createHash } from "crypto";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { secrets } from "@/db/schema";
import { logger } from "@/lib/logger.ts";

import type {
    components,
} from "../../types/apis/machines.dev";

export const secretsHono = new Hono();

// List secrets for an app
secretsHono.get("/:app_name/secrets", async (c) => {
    const { app_name } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const secretsList = await db.query.secrets.findMany({
        where: (secrets, { eq }) => eq(secrets.appId, app.id),
        orderBy: (secrets, { asc }) => asc(secrets.name),
    });

    const secretsResponse = {
        secrets: secretsList.map(secret => ({
            name: secret.name,
            digest: secret.digest,
        })),
    };

    return c.json(secretsResponse);
});

// Set a secret (POST to /secrets/{secret_name})
secretsHono.post("/:app_name/secrets/:secret_name", async (c) => {
    const { app_name, secret_name } = c.req.param();
    const secretRequest = await c.req.json() as components["schemas"]["SetAppSecretRequest"];

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    if (!secretRequest.value) {
        return c.json({ error: "Secret value is required" }, 400);
    }

    const timestamp = new Date().toISOString();
    const digest = createHash('sha256').update(secretRequest.value).digest('hex');

    try {
        // Check if secret already exists
        const existingSecret = await db.query.secrets.findFirst({
            where: (secrets, { eq, and }) => and(
                eq(secrets.appId, app.id),
                eq(secrets.name, secret_name)
            ),
        });

        if (existingSecret) {
            // Update existing secret
            await db
                .update(secrets)
                .set({
                    digest,
                    updatedAt: timestamp,
                })
                .where(eq(secrets.id, existingSecret.id));
        } else {
            // Create new secret
            await db
                .insert(secrets)
                .values({
                    appId: app.id,
                    name: secret_name,
                    digest,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                });
        }

        const response = {
            success: true,
        };

        logger.info(`Set secret ${secret_name} for app ${app_name}`);
        return c.json(response);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to set secret: ${errorMessage}`);
        return c.json({ error: "Failed to set secret", details: errorMessage }, 500);
    }
});

// Get a specific secret (returns metadata only, not value)
secretsHono.get("/:app_name/secrets/:secret_name", async (c) => {
    const { app_name, secret_name } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const secret = await db.query.secrets.findFirst({
        where: (secrets, { eq, and }) => and(
            eq(secrets.appId, app.id),
            eq(secrets.name, secret_name)
        ),
    });

    if (!secret) {
        return c.json({ error: "Secret not found" }, 404);
    }

    const secretResponse = {
        name: secret.name,
        digest: secret.digest,
    };

    return c.json(secretResponse);
});

// Delete a secret
secretsHono.delete("/:app_name/secrets/:secret_name", async (c) => {
    const { app_name, secret_name } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const secret = await db.query.secrets.findFirst({
        where: (secrets, { eq, and }) => and(
            eq(secrets.appId, app.id),
            eq(secrets.name, secret_name)
        ),
    });

    if (!secret) {
        return c.json({ error: "Secret not found" }, 404);
    }

    try {
        await db.delete(secrets).where(eq(secrets.id, secret.id));

        logger.info(`Deleted secret ${secret_name} for app ${app_name}`);
        return c.body(null, 204);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to delete secret: ${errorMessage}`);
        return c.json({ error: "Failed to delete secret", details: errorMessage }, 500);
    }
});