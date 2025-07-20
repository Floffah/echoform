import { Hono } from "hono";
import { randomBytes } from "crypto";
import { eq, and, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { machines } from "@/db/schema";
import { docker } from "@/lib/docker";
import { logger } from "@/lib/logger";

import type {
    CreateMachineRequest,
    Machine,
    UpdateMachineRequest,
    paths,
} from "../../types/apis/machines.dev";

export const machinesHono = new Hono();

// Generate machine ID
function generateMachineId(): string {
    return randomBytes(8).toString("hex");
}

// Generate private IP (simulate 6PN address)
function generatePrivateIp(): string {
    return `fdaa:0:1::${Math.floor(Math.random() * 65536).toString(16)}`;
}

// List machines for an app
machinesHono.get("/:app_name/machines", async (c) => {
    const { app_name } = c.req.param();
    const queryParams = c.req.query() as paths["/apps/{app_name}/machines"]["get"]["parameters"]["query"];
    const { include_deleted, region, state } = queryParams || {};

    // Check if app exists
    const app = await db.query.apps.findFirst({
        where: (apps, { eq: eqOp }) => eqOp(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    // Build query conditions
    const conditions = [eq(machines.appName, app_name)];
    
    if (region) {
        conditions.push(eq(machines.region, region));
    }
    
    if (state) {
        const states = state.split(",");
        conditions.push(inArray(machines.state, states));
    }
    
    if (!include_deleted) {
        // Exclude destroyed machines unless explicitly requested  
        conditions.push(ne(machines.state, "destroyed"));
    }

    const machineRecords = await db.query.machines.findMany({
        where: and(...conditions),
        orderBy: (machines, { asc }) => asc(machines.createdAt),
    });

    // Convert to API format
    const apiMachines: Machine[] = machineRecords.map((machine) => ({
        id: machine.id,
        name: machine.name || undefined,
        state: machine.state || undefined,
        region: machine.region || undefined,
        image_ref: machine.image ? { registry: "local", repository: machine.image, tag: "latest" } : undefined,
        private_ip: machine.privateIp || undefined,
        created_at: machine.createdAt || undefined,
        updated_at: machine.updatedAt || undefined,
        config: machine.config ? JSON.parse(machine.config) : undefined,
        host_status: "ok" as const,
    }));

    return c.json(apiMachines);
});

// Create machine
machinesHono.post("/:app_name/machines", async (c) => {
    const { app_name } = c.req.param();
    const createRequest = await c.req.json<CreateMachineRequest>();

    // Check if app exists
    const app = await db.query.apps.findFirst({
        where: (apps, { eq: eqOp }) => eqOp(apps.name, app_name),
    });

    if (!app) {
        return c.json({ error: "App not found" }, 404);
    }

    const machineId = generateMachineId();
    const machineName = createRequest.name || `machine-${machineId}`;
    const region = createRequest.region || "local";
    const privateIp = generatePrivateIp();

    // Extract image from config
    const image = createRequest.config?.image || "alpine:latest";
    
    try {
        // Create Docker container
        const container = await docker.createContainer({
            Image: image,
            name: `localfly-${app_name}-${machineId}`,
            Env: createRequest.config?.env ? Object.entries(createRequest.config.env).map(([k, v]) => `${k}=${v}`) : [],
            Labels: {
                "localfly.app": app_name,
                "localfly.machine": machineId,
            },
            AttachStdout: true,
            AttachStderr: true,
        });

        // Store machine in database
        const [newMachine] = await db
            .insert(machines)
            .values({
                id: machineId,
                name: machineName,
                appName: app_name,
                region,
                state: "created",
                image,
                config: JSON.stringify(createRequest.config || {}),
                containerId: container.id,
                privateIp,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })
            .returning();

        // Start container if not skip_launch
        if (!createRequest.skip_launch) {
            await container.start();
            
            // Update state to started
            await db
                .update(machines)
                .set({ 
                    state: "started",
                    updatedAt: new Date().toISOString() 
                })
                .where(eq(machines.id, machineId));
        }

        logger.info(`Created machine ${machineId} for app ${app_name}`);

        // Return machine data
        const machine: Machine = {
            id: machineId,
            name: machineName,
            state: createRequest.skip_launch ? "created" : "started",
            region,
            image_ref: { registry: "local", repository: image, tag: "latest" },
            private_ip: privateIp,
            created_at: newMachine.createdAt,
            updated_at: newMachine.updatedAt,
            config: createRequest.config,
            host_status: "ok" as const,
        };

        return c.json(machine);

    } catch (error) {
        logger.error(`Failed to create machine: ${String(error)}`);
        return c.json({ error: "Failed to create machine" }, 500);
    }
});

// Get machine details
machinesHono.get("/:app_name/machines/:machine_id", async (c) => {
    const { app_name, machine_id } = c.req.param();

    const machine = await db.query.machines.findFirst({
        where: and(
            eq(machines.appName, app_name),
            eq(machines.id, machine_id)
        ),
    });

    if (!machine) {
        return c.json({ error: "Machine not found" }, 404);
    }

    const apiMachine: Machine = {
        id: machine.id,
        name: machine.name || undefined,
        state: machine.state || undefined,
        region: machine.region || undefined,
        image_ref: machine.image ? { registry: "local", repository: machine.image, tag: "latest" } : undefined,
        private_ip: machine.privateIp || undefined,
        created_at: machine.createdAt || undefined,
        updated_at: machine.updatedAt || undefined,
        config: machine.config ? JSON.parse(machine.config) : undefined,
        host_status: "ok" as const,
    };

    return c.json(apiMachine);
});

// Update machine
machinesHono.post("/:app_name/machines/:machine_id", async (c) => {
    const { app_name, machine_id } = c.req.param();
    const updateRequest = await c.req.json<UpdateMachineRequest>();

    const machine = await db.query.machines.findFirst({
        where: and(
            eq(machines.appName, app_name),
            eq(machines.id, machine_id)
        ),
    });

    if (!machine) {
        return c.json({ error: "Machine not found" }, 404);
    }

    try {
        // Update machine configuration
        const updatedValues: Record<string, string> = {
            updatedAt: new Date().toISOString(),
        };

        if (updateRequest.name) {
            updatedValues.name = updateRequest.name;
        }

        if (updateRequest.config) {
            updatedValues.config = JSON.stringify(updateRequest.config);
            
            // If image changed, recreate container
            if (updateRequest.config.image && updateRequest.config.image !== machine.image) {
                const container = docker.getContainer(machine.containerId!);
                await container.remove({ force: true });
                
                const newContainer = await docker.createContainer({
                    Image: updateRequest.config.image,
                    name: `localfly-${app_name}-${machine_id}`,
                    Env: updateRequest.config.env ? Object.entries(updateRequest.config.env).map(([k, v]) => `${k}=${v}`) : [],
                    Labels: {
                        "localfly.app": app_name,
                        "localfly.machine": machine_id,
                    },
                });
                
                updatedValues.containerId = newContainer.id;
                updatedValues.image = updateRequest.config.image;
            }
        }

        await db
            .update(machines)
            .set(updatedValues)
            .where(eq(machines.id, machine_id));

        logger.info(`Updated machine ${machine_id} for app ${app_name}`);

        // Return updated machine
        const updatedMachine = await db.query.machines.findFirst({
            where: eq(machines.id, machine_id),
        });

        const apiMachine: Machine = {
            id: updatedMachine!.id,
            name: updatedMachine!.name || undefined,
            state: updatedMachine!.state || undefined,
            region: updatedMachine!.region || undefined,
            image_ref: updatedMachine!.image ? { registry: "local", repository: updatedMachine!.image, tag: "latest" } : undefined,
            private_ip: updatedMachine!.privateIp || undefined,
            created_at: updatedMachine!.createdAt || undefined,
            updated_at: updatedMachine!.updatedAt || undefined,
            config: updatedMachine!.config ? JSON.parse(updatedMachine!.config) : undefined,
            host_status: "ok" as const,
        };

        return c.json(apiMachine);

    } catch (error) {
        logger.error(`Failed to update machine: ${String(error)}`);
        return c.json({ error: "Failed to update machine" }, 500);
    }
});

// Delete machine
machinesHono.delete("/:app_name/machines/:machine_id", async (c) => {
    const { app_name, machine_id } = c.req.param();
    const { force } = c.req.query();

    const machine = await db.query.machines.findFirst({
        where: and(
            eq(machines.appName, app_name),
            eq(machines.id, machine_id)
        ),
    });

    if (!machine) {
        return c.json({ error: "Machine not found" }, 404);
    }

    try {
        // Stop and remove Docker container
        if (machine.containerId) {
            const container = docker.getContainer(machine.containerId);
            await container.remove({ force: force === "true" });
        }

        // Update machine state to destroyed
        await db
            .update(machines)
            .set({ 
                state: "destroyed",
                updatedAt: new Date().toISOString() 
            })
            .where(eq(machines.id, machine_id));

        logger.info(`Destroyed machine ${machine_id} for app ${app_name}`);

        return c.body(null, 200);

    } catch (error) {
        logger.error(`Failed to destroy machine: ${String(error)}`);
        return c.json({ error: "Failed to destroy machine" }, 500);
    }
});

// Start machine
machinesHono.post("/:app_name/machines/:machine_id/start", async (c) => {
    const { app_name, machine_id } = c.req.param();

    const machine = await db.query.machines.findFirst({
        where: and(
            eq(machines.appName, app_name),
            eq(machines.id, machine_id)
        ),
    });

    if (!machine) {
        return c.json({ error: "Machine not found" }, 404);
    }

    if (machine.state === "started") {
        return c.body(null, 200);
    }

    try {
        if (machine.containerId) {
            const container = docker.getContainer(machine.containerId);
            await container.start();
        }

        await db
            .update(machines)
            .set({ 
                state: "started",
                updatedAt: new Date().toISOString() 
            })
            .where(eq(machines.id, machine_id));

        logger.info(`Started machine ${machine_id} for app ${app_name}`);

        return c.body(null, 200);

    } catch (error) {
        logger.error(`Failed to start machine: ${String(error)}`);
        return c.json({ error: "Failed to start machine" }, 500);
    }
});

// Stop machine
machinesHono.post("/:app_name/machines/:machine_id/stop", async (c) => {
    const { app_name, machine_id } = c.req.param();

    const machine = await db.query.machines.findFirst({
        where: and(
            eq(machines.appName, app_name),
            eq(machines.id, machine_id)
        ),
    });

    if (!machine) {
        return c.json({ error: "Machine not found" }, 404);
    }

    if (machine.state === "stopped") {
        return c.body(null, 200);
    }

    try {
        if (machine.containerId) {
            const container = docker.getContainer(machine.containerId);
            await container.stop();
        }

        await db
            .update(machines)
            .set({ 
                state: "stopped",
                updatedAt: new Date().toISOString() 
            })
            .where(eq(machines.id, machine_id));

        logger.info(`Stopped machine ${machine_id} for app ${app_name}`);

        return c.body(null, 200);

    } catch (error) {
        logger.error(`Failed to stop machine: ${String(error)}`);
        return c.json({ error: "Failed to stop machine" }, 500);
    }
});