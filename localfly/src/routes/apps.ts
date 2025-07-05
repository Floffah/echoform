import { Hono } from "hono";

import { db } from "@/db";
import { apps } from "@/db/schema";
import { docker } from "@/lib/docker.ts";

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

    const apps = await db.query.apps.findMany({
        where: (apps, { eq }) => eq(apps.orgSlug, org_slug),
        orderBy: (apps, { asc }) => asc(apps.name),
    });

    return c.json(apps);
});

appsHono.post("/", async (c) => {
    const { app_name, enable_subdomains, network, org_slug } =
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
