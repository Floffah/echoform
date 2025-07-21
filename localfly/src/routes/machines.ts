import { Hono } from "hono";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { machines, events } from "@/db/schema";
import { dockerService } from "@/lib/docker.ts";
import { logger } from "@/lib/logger.ts";

import type {
    components,
} from "../../types/apis/machines.dev";

export const machinesHono = new Hono();

// List machines for an app
machinesHono.get("/:app_name/machines", async (c) => {
    const { app_name } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const machinesList = await db.query.machines.findMany({
        where: (machines, { eq }) => eq(machines.appId, app.id),
        orderBy: (machines, { asc }) => asc(machines.createdAt),
    });

    const machinesResponse = await Promise.all(
        machinesList.map(async (machine) => {
            return {
                id: machine.id,
                name: machine.name,
                state: machine.state,
                region: machine.region,
                instance_id: machine.instanceId,
                private_ip: machine.privateIp,
                config: machine.config ? JSON.parse(machine.config) : {},
                image_ref: machine.imageRef ? JSON.parse(machine.imageRef) : null,
                created_at: machine.createdAt,
                updated_at: machine.updatedAt,
                events: [],
                checks: [],
                user_config: machine.config ? JSON.parse(machine.config) : {},
            };
        })
    );

    return c.json(machinesResponse);
});

// Create a new machine
machinesHono.post("/:app_name/machines", async (c) => {
    const { app_name } = c.req.param();
    const machineRequest = await c.req.json() as components["schemas"]["CreateMachineRequest"];

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const machineId = randomUUID();
    const timestamp = new Date().toISOString();
    const region = machineRequest.region || "local";
    
    if (!machineRequest.config?.image) {
        return c.json({ error: "Image is required in machine config" }, 400);
    }

    try {
        // Create container
        const containerName = `${app_name}-${machineId}`;
        const container = await dockerService.createContainer({
            image: machineRequest.config.image,
            name: containerName,
            labels: {
                "localfly.app": app_name,
                "localfly.machine_id": machineId,
                "localfly.region": region,
            },
            env: machineRequest.config.env ? Object.entries(machineRequest.config.env).map(([k, v]) => `${k}=${v}`) : [],
        });

        // Parse image reference to extract registry, repository, and tag
        const parseImageRef = (image: string) => {
            // Examples:
            // nginx:alpine -> { registry: "", repository: "nginx", tag: "alpine" }
            // docker.io/nginx:alpine -> { registry: "docker.io", repository: "nginx", tag: "alpine" }
            // ghcr.io/user/repo:latest -> { registry: "ghcr.io", repository: "user/repo", tag: "latest" }
            
            let registry = "";
            let repository = image;
            let tag = "latest";
            
            // Check if image has a tag
            const tagSeparator = image.lastIndexOf(":");
            if (tagSeparator > 0) {
                // Make sure the colon is not part of a registry hostname (like localhost:5000)
                const afterColon = image.substring(tagSeparator + 1);
                if (!afterColon.includes("/")) {
                    tag = afterColon;
                    repository = image.substring(0, tagSeparator);
                }
            }
            
            // Check if repository has a registry
            const slashIndex = repository.indexOf("/");
            if (slashIndex > 0) {
                const firstPart = repository.substring(0, slashIndex);
                // If the first part contains a dot or colon, it's likely a registry
                if (firstPart.includes(".") || firstPart.includes(":")) {
                    registry = firstPart;
                    repository = repository.substring(slashIndex + 1);
                }
            }
            
            return { registry, repository, tag };
        };

        const imageRef = parseImageRef(machineRequest.config.image);

        // Insert machine record
        const newMachine = await db
            .insert(machines)
            .values({
                id: machineId,
                appId: app.id,
                name: machineRequest.name || containerName,
                state: machineRequest.skip_launch ? "stopped" : "starting",
                region,
                config: JSON.stringify(machineRequest.config),
                imageRef: JSON.stringify(imageRef),
                createdAt: timestamp,
                updatedAt: timestamp,
                containerId: container.id,
            })
            .returning();

        // Log event
        await db.insert(events).values({
            machineId,
            type: "create",
            status: "success",
            timestamp,
            request: JSON.stringify(machineRequest),
            source: "api",
        });

        // Start container if not skipping launch
        if (!machineRequest.skip_launch) {
            await dockerService.startContainer(container.id);
            
            // Update machine state
            await db
                .update(machines)
                .set({ 
                    state: "started",
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(machines.id, machineId));

            // Log start event
            await db.insert(events).values({
                machineId,
                type: "start",
                status: "success",
                timestamp: new Date().toISOString(),
                source: "api",
            });
        }

        const machineResponse = {
            id: machineId,
            name: newMachine[0]?.name || containerName,
            state: newMachine[0]?.state || "stopped",
            region: newMachine[0]?.region || region,
            instance_id: machineId,
            private_ip: "127.0.0.1", // Local development
            config: JSON.parse(newMachine[0]?.config || "{}"),
            image_ref: JSON.parse(newMachine[0]?.imageRef || "{}"),
            created_at: newMachine[0]?.createdAt || timestamp,
            updated_at: newMachine[0]?.updatedAt || timestamp,
            events: [],
            checks: [],
        };

        return c.json(machineResponse, 201);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to create machine: ${errorMessage}`);
        
        // Log error event
        await db.insert(events).values({
            machineId,
            type: "create",
            status: "error",
            timestamp: new Date().toISOString(),
            request: JSON.stringify({ error: errorMessage }),
            source: "api",
        });

        return c.json({ error: "Failed to create machine", details: errorMessage }, 500);
    }
});

// Get machine details
machinesHono.get("/:app_name/machines/:machine_id", async (c) => {
    const { app_name, machine_id } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const machine = await db.query.machines.findFirst({
        where: (machines, { eq, and }) => and(
            eq(machines.id, machine_id),
            eq(machines.appId, app.id)
        ),
    });

    if (!machine) {
        return c.json({ error: "Machine not found" }, 404);
    }

    const machineResponse = {
        id: machine.id,
        name: machine.name,
        state: machine.state,
        region: machine.region,
        instance_id: machine.instanceId,
        private_ip: machine.privateIp,
        config: machine.config ? JSON.parse(machine.config) : {},
        image_ref: machine.imageRef ? JSON.parse(machine.imageRef) : null,
        created_at: machine.createdAt,
        updated_at: machine.updatedAt,
        events: [],
        checks: [],
        user_config: machine.config ? JSON.parse(machine.config) : {},
    };

    return c.json(machineResponse);
});

// Delete machine
machinesHono.delete("/:app_name/machines/:machine_id", async (c) => {
    const { app_name, machine_id } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const machine = await db.query.machines.findFirst({
        where: (machines, { eq, and }) => and(
            eq(machines.id, machine_id),
            eq(machines.appId, app.id)
        ),
    });

    if (!machine) {
        return c.json({ error: "Machine not found" }, 404);
    }

    try {
        // Stop and remove container if it exists
        if (machine.containerId) {
            try {
                await dockerService.stopContainer(machine.containerId);
                await dockerService.removeContainer(machine.containerId, true);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.warn(`Failed to clean up container ${machine.containerId}: ${errorMessage}`);
            }
        }

        // Delete machine record
        await db.delete(machines).where(eq(machines.id, machine_id));

        // Log event
        await db.insert(events).values({
            machineId: machine_id,
            type: "destroy",
            status: "success",
            timestamp: new Date().toISOString(),
            source: "api",
        });

        return c.body(null, 204);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to delete machine: ${errorMessage}`);
        
        // Log error event
        await db.insert(events).values({
            machineId: machine_id,
            type: "destroy",
            status: "error",
            timestamp: new Date().toISOString(),
            request: JSON.stringify({ error: errorMessage }),
            source: "api",
        });

        return c.json({ error: "Failed to delete machine", details: errorMessage }, 500);
    }
});

// List machine events
machinesHono.get("/:app_name/machines/:machine_id/events", async (c) => {
    const { app_name, machine_id } = c.req.param();

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const machine = await db.query.machines.findFirst({
        where: (machines, { eq, and }) => and(
            eq(machines.id, machine_id),
            eq(machines.appId, app.id)
        ),
    });

    if (!machine) {
        return c.json({ error: "Machine not found" }, 404);
    }

    const machineEvents = await db.query.events.findMany({
        where: (events, { eq }) => eq(events.machineId, machine_id),
        orderBy: (events, { desc }) => desc(events.timestamp),
    });

    const eventsResponse = machineEvents.map(event => ({
        id: event.id.toString(),
        type: event.type,
        status: event.status,
        timestamp: event.timestamp,
        request: event.request ? JSON.parse(event.request) : null,
        source: event.source,
    }));

    return c.json(eventsResponse);
});