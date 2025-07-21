import { Hono } from "hono";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { volumes } from "@/db/schema";
import { logger } from "@/lib/logger.ts";

import type {
    components,
} from "../../types/apis/machines.dev";

export const volumesHono = new Hono();

// List volumes for an app
volumesHono.get("/:app_name/volumes", async (c) => {
    const { app_name } = c.req.param();
    const { summary } = c.req.query();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const volumesList = await db.query.volumes.findMany({
        where: (volumes, { eq }) => eq(volumes.appId, app.id),
        orderBy: (volumes, { asc }) => asc(volumes.createdAt),
    });

    const volumesResponse = volumesList.map(volume => {
        const baseVolume = {
            id: volume.id,
            name: volume.name,
            region: volume.region,
            size_gb: volume.sizeGb,
            state: volume.state,
            encrypted: volume.encrypted,
            created_at: volume.createdAt,
            attached_alloc_id: null,
            attached_machine_id: null,
            block_size: 4096,
            blocks: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
            blocks_avail: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
            blocks_free: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
            fstype: volume.fstype || "ext4",
        };

        if (summary === "true") {
            // Return summary version without block details
            const { block_size, blocks, blocks_avail, blocks_free, ...summaryVolume } = baseVolume;
            return summaryVolume;
        }

        return baseVolume;
    });

    return c.json(volumesResponse);
});

// Create a new volume
volumesHono.post("/:app_name/volumes", async (c) => {
    const { app_name } = c.req.param();
    const volumeRequest = await c.req.json() as components["schemas"]["CreateVolumeRequest"];

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    if (!volumeRequest.name || !volumeRequest.size_gb) {
        return c.json({ error: "Volume name and size_gb are required" }, 400);
    }

    // Check if volume name already exists for this app
    const existingVolume = await db.query.volumes.findFirst({
        where: (volumes, { eq, and }) => and(
            eq(volumes.appId, app.id),
            eq(volumes.name, volumeRequest.name!)
        ),
    });

    if (existingVolume) {
        return c.json({ error: "Volume with this name already exists" }, 400);
    }

    const volumeId = randomUUID();
    const timestamp = new Date().toISOString();
    const region = volumeRequest.region || "local";

    try {
        const newVolume = await db
            .insert(volumes)
            .values({
                id: volumeId,
                appId: app.id,
                name: volumeRequest.name,
                region,
                sizeGb: volumeRequest.size_gb,
                state: "created",
                encrypted: volumeRequest.encrypted || false,
                fstype: volumeRequest.fstype || "ext4",
                createdAt: timestamp,
                updatedAt: timestamp,
            })
            .returning();

        const volumeResponse = {
            id: volumeId,
            name: newVolume[0]?.name || volumeRequest.name,
            region: newVolume[0]?.region || region,
            size_gb: newVolume[0]?.sizeGb || volumeRequest.size_gb,
            state: newVolume[0]?.state || "created",
            encrypted: newVolume[0]?.encrypted || false,
            created_at: newVolume[0]?.createdAt || timestamp,
            attached_alloc_id: null,
            attached_machine_id: null,
            block_size: 4096,
            blocks: Math.floor(((newVolume[0]?.sizeGb || volumeRequest.size_gb) * 1024 * 1024 * 1024) / 4096),
            blocks_avail: Math.floor(((newVolume[0]?.sizeGb || volumeRequest.size_gb) * 1024 * 1024 * 1024) / 4096),
            blocks_free: Math.floor(((newVolume[0]?.sizeGb || volumeRequest.size_gb) * 1024 * 1024 * 1024) / 4096),
            fstype: newVolume[0]?.fstype || "ext4",
        };

        logger.info(`Created volume ${volumeId} for app ${app_name}`);
        return c.json(volumeResponse, 201);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to create volume: ${errorMessage}`);
        return c.json({ error: "Failed to create volume", details: errorMessage }, 500);
    }
});

// Get volume by ID
volumesHono.get("/:app_name/volumes/:volume_id", async (c) => {
    const { app_name, volume_id } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const volume = await db.query.volumes.findFirst({
        where: (volumes, { eq, and }) => and(
            eq(volumes.id, volume_id),
            eq(volumes.appId, app.id)
        ),
    });

    if (!volume) {
        return c.json({ error: "Volume not found" }, 404);
    }

    const volumeResponse = {
        id: volume.id,
        name: volume.name,
        region: volume.region,
        size_gb: volume.sizeGb,
        state: volume.state,
        encrypted: volume.encrypted,
        created_at: volume.createdAt,
        attached_alloc_id: null,
        attached_machine_id: null,
        block_size: 4096,
        blocks: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
        blocks_avail: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
        blocks_free: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
        fstype: volume.fstype,
    };

    return c.json(volumeResponse);
});

// Delete volume
volumesHono.delete("/:app_name/volumes/:volume_id", async (c) => {
    const { app_name, volume_id } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const volume = await db.query.volumes.findFirst({
        where: (volumes, { eq, and }) => and(
            eq(volumes.id, volume_id),
            eq(volumes.appId, app.id)
        ),
    });

    if (!volume) {
        return c.json({ error: "Volume not found" }, 404);
    }

    try {
        // For local development, we just delete the database record
        // In a real implementation, this would also clean up the actual volume storage
        
        await db.delete(volumes).where(eq(volumes.id, volume_id));

        const volumeResponse = {
            id: volume.id,
            name: volume.name,
            region: volume.region,
            size_gb: volume.sizeGb,
            state: "destroying",
            encrypted: volume.encrypted,
            created_at: volume.createdAt,
            attached_alloc_id: null,
            attached_machine_id: null,
            block_size: 4096,
            blocks: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
            blocks_avail: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
            blocks_free: Math.floor((volume.sizeGb * 1024 * 1024 * 1024) / 4096),
            fstype: volume.fstype,
        };

        logger.info(`Deleted volume ${volume_id} for app ${app_name}`);
        return c.json(volumeResponse);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to delete volume: ${errorMessage}`);
        return c.json({ error: "Failed to delete volume", details: errorMessage }, 500);
    }
});

// Extend volume
volumesHono.post("/:app_name/volumes/:volume_id/extend", async (c) => {
    const { app_name, volume_id } = c.req.param();
    const extendRequest = await c.req.json() as components["schemas"]["ExtendVolumeRequest"];

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const volume = await db.query.volumes.findFirst({
        where: (volumes, { eq, and }) => and(
            eq(volumes.id, volume_id),
            eq(volumes.appId, app.id)
        ),
    });

    if (!volume) {
        return c.json({ error: "Volume not found" }, 404);
    }

    if (!extendRequest.size_gb || extendRequest.size_gb <= volume.sizeGb) {
        return c.json({ error: "New size must be greater than current size" }, 400);
    }

    try {
        const updatedVolume = await db
            .update(volumes)
            .set({
                sizeGb: extendRequest.size_gb,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(volumes.id, volume_id))
            .returning();

        const volumeResponse = {
            id: updatedVolume[0]?.id || volume_id,
            name: updatedVolume[0]?.name || volume.name,
            region: updatedVolume[0]?.region || volume.region,
            size_gb: updatedVolume[0]?.sizeGb || extendRequest.size_gb,
            state: updatedVolume[0]?.state || volume.state,
            encrypted: updatedVolume[0]?.encrypted || volume.encrypted,
            created_at: updatedVolume[0]?.createdAt || volume.createdAt,
            attached_alloc_id: null,
            attached_machine_id: null,
            block_size: 4096,
            blocks: Math.floor(((updatedVolume[0]?.sizeGb || extendRequest.size_gb) * 1024 * 1024 * 1024) / 4096),
            blocks_avail: Math.floor(((updatedVolume[0]?.sizeGb || extendRequest.size_gb) * 1024 * 1024 * 1024) / 4096),
            blocks_free: Math.floor(((updatedVolume[0]?.sizeGb || extendRequest.size_gb) * 1024 * 1024 * 1024) / 4096),
            fstype: updatedVolume[0]?.fstype || volume.fstype,
        };

        const extendResponse = {
            needs_restart: false, // For local development, assume no restart needed
            volume: volumeResponse,
        };

        logger.info(`Extended volume ${volume_id} to ${extendRequest.size_gb}GB`);
        return c.json(extendResponse);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to extend volume: ${errorMessage}`);
        return c.json({ error: "Failed to extend volume", details: errorMessage }, 500);
    }
});