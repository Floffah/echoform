import { Hono } from "hono";
import { randomUUID } from "crypto";

import { db } from "@/db";
import { apps, machines, events } from "@/db/schema";
import { dockerService } from "@/lib/docker.ts";
import { logger } from "@/lib/logger.ts";

import type {
    paths,
    components,
} from "../../types/apis/machines.dev";

export const machinesHono = new Hono();

// List machines for an app
machinesHono.get("/:app_name/machines", async (c) => {
    const { app_name } = c.req.param();
    const { include_deleted } = c.req.query() as paths["/apps/{app_name}/machines"]["get"]["parameters"]["query"];

    const app = await db.query.apps.findFirst({
        where: (apps, { eq }) => eq(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    let whereClause = (machines: any, { eq }: any) => eq(machines.appId, app.id);
    
    if (!include_deleted) {
        whereClause = (machines: any, { eq, ne }: any) => 
            eq(machines.appId, app.id);
    }

    const machinesList = await db.query.machines.findMany({
        where: whereClause,
        orderBy: (machines, { asc }) => asc(machines.createdAt),
    });

    const machinesResponse = await Promise.all(
        machinesList.map(async (machine) => {
            let containerInfo = null;
            if (machine.containerId) {
                try {
                    containerInfo = await dockerService.getContainerInfo(machine.containerId);
                } catch (error) {
                    logger.warn(`Failed to get container info for ${machine.containerId}: ${error}`);
                }
            }

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
                imageRef: JSON.stringify({
                    repository: machineRequest.config.image,
                    tag: "latest",
                }),
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
                .where((table, { eq }) => eq(table.id, machineId));

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
            name: newMachine[0].name,
            state: newMachine[0].state,
            region: newMachine[0].region,
            instance_id: machineId,
            private_ip: "127.0.0.1", // Local development
            config: JSON.parse(newMachine[0].config!),
            image_ref: JSON.parse(newMachine[0].imageRef!),
            created_at: newMachine[0].createdAt,
            updated_at: newMachine[0].updatedAt,
            events: [],
            checks: [],
        };

        return c.json(machineResponse, 201);
    } catch (error) {
        logger.error(`Failed to create machine: ${error}`);
        
        // Log error event
        await db.insert(events).values({
            machineId,
            type: "create",
            status: "error",
            timestamp: new Date().toISOString(),
            request: JSON.stringify({ error: String(error) }),
            source: "api",
        });

        return c.json({ error: "Failed to create machine", details: String(error) }, 500);
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

    let containerInfo = null;
    if (machine.containerId) {
        try {
            containerInfo = await dockerService.getContainerInfo(machine.containerId);
        } catch (error) {
            logger.warn(`Failed to get container info for ${machine.containerId}: ${error}`);
        }
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
    const { force } = c.req.query() as { force?: string };

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
                await dockerService.removeContainer(machine.containerId, force === "true");
            } catch (error) {
                logger.warn(`Failed to clean up container ${machine.containerId}: ${error}`);
            }
        }

        // Delete machine record
        await db.delete(machines).where((table, { eq }) => eq(table.id, machine_id));

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
        logger.error(`Failed to delete machine: ${error}`);
        
        // Log error event
        await db.insert(events).values({
            machineId: machine_id,
            type: "destroy",
            status: "error",
            timestamp: new Date().toISOString(),
            request: JSON.stringify({ error: String(error) }),
            source: "api",
        });

        return c.json({ error: "Failed to delete machine", details: String(error) }, 500);
    }
});

// Start machine
machinesHono.post("/:app_name/machines/:machine_id/start", async (c) => {
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

    if (!machine.containerId) {
        return c.json({ error: "Machine has no associated container" }, 400);
    }

    try {
        await dockerService.startContainer(machine.containerId);
        
        // Update machine state
        await db
            .update(machines)
            .set({ 
                state: "started",
                updatedAt: new Date().toISOString(),
            })
            .where((table, { eq }) => eq(table.id, machine_id));

        // Log event
        await db.insert(events).values({
            machineId: machine_id,
            type: "start",
            status: "success",
            timestamp: new Date().toISOString(),
            source: "api",
        });

        return c.body(null, 204);
    } catch (error) {
        logger.error(`Failed to start machine: ${error}`);
        
        // Log error event
        await db.insert(events).values({
            machineId: machine_id,
            type: "start",
            status: "error",
            timestamp: new Date().toISOString(),
            request: JSON.stringify({ error: String(error) }),
            source: "api",
        });

        return c.json({ error: "Failed to start machine", details: String(error) }, 500);
    }
});

// Stop machine
machinesHono.post("/:app_name/machines/:machine_id/stop", async (c) => {
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

    if (!machine.containerId) {
        return c.json({ error: "Machine has no associated container" }, 400);
    }

    try {
        await dockerService.stopContainer(machine.containerId);
        
        // Update machine state
        await db
            .update(machines)
            .set({ 
                state: "stopped",
                updatedAt: new Date().toISOString(),
            })
            .where((table, { eq }) => eq(table.id, machine_id));

        // Log event
        await db.insert(events).values({
            machineId: machine_id,
            type: "stop",
            status: "success",
            timestamp: new Date().toISOString(),
            source: "api",
        });

        return c.body(null, 204);
    } catch (error) {
        logger.error(`Failed to stop machine: ${error}`);
        
        // Log error event
        await db.insert(events).values({
            machineId: machine_id,
            type: "stop",
            status: "error",
            timestamp: new Date().toISOString(),
            request: JSON.stringify({ error: String(error) }),
            source: "api",
        });

        return c.json({ error: "Failed to stop machine", details: String(error) }, 500);
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