import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { apps } from "@/db/schema";

import type {
    SchemaCreateAppRequest,
    paths,
} from "../../types/apis/machines.dev";

export const appsHono = new Hono();

appsHono.get("/", async (c) => {
    const { org_slug } =
        c.req.query() as paths["/apps"]["get"]["parameters"]["query"];

    if (!org_slug) {
        return c.json({ error: "org_slug is required" }, 400);
    }

    const appsList = await db.query.apps.findMany({
        where: (apps, { eq }) => eq(apps.orgSlug, org_slug),
        orderBy: (apps, { asc }) => asc(apps.name),
    });

    return c.json(appsList);
});

appsHono.post("/", async (c) => {
    const { app_name, org_slug } =
        await c.req.json<SchemaCreateAppRequest>();

    if (!app_name || !org_slug) {
        return c.json({ error: "app_name and org_slug are required" }, 400);
    }

    const existingApp = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (existingApp) {
        return c.json({ error: "App already exists" }, 400);
    }

    await db
        .insert(apps)
        .values({
            name: app_name,
            orgSlug: org_slug,
        })
        .returning();

    return c.body(null, 201);
});

appsHono.get("/:app_name", async (c) => {
    const { app_name } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    return c.json({
        id: app.id.toString(),
        name: app.name,
        organization: { slug: app.orgSlug },
        status: "deployed",
    });
});

appsHono.delete("/:app_name", async (c) => {
    const { app_name } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    await db.delete(apps).where(eq(apps.id, app.id));

    return c.body(null, 204);
});
