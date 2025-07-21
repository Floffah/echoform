import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import app from "../index.ts";
import { db } from "../db/index.ts";
import { apps, machines } from "../db/schema/index.ts";
import { eq } from "drizzle-orm";

describe("Machines API", () => {
    let testAppId: number;
    const testAppName = "test-machines-app";
    const testOrgSlug = "test-machines-org";

    beforeAll(async () => {
        // Create test app
        const newApp = await db
            .insert(apps)
            .values({
                name: testAppName,
                orgSlug: testOrgSlug,
            })
            .returning();
        testAppId = newApp[0].id;
    });

    afterAll(async () => {
        // Clean up test data
        await db.delete(machines).where(eq(machines.appId, testAppId));
        await db.delete(apps).where(eq(apps.id, testAppId));
    });

    beforeEach(async () => {
        // Clean up machines before each test
        await db.delete(machines).where(eq(machines.appId, testAppId));
    });

    describe("GET /v1/apps/:app_name/machines", () => {
        it("should return empty array for app with no machines", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/machines`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(Array.isArray(body)).toBe(true);
            expect(body.length).toBe(0);
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/machines");
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });

        it("should list machines for app", async () => {
            // Create a test machine first
            const createRes = await app.request(`/v1/apps/${testAppName}/machines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config: { image: "nginx:alpine" },
                    region: "local",
                    skip_launch: true,
                }),
            });
            expect(createRes.status).toBe(201);

            // List machines
            const res = await app.request(`/v1/apps/${testAppName}/machines`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(Array.isArray(body)).toBe(true);
            expect(body.length).toBe(1);
            expect(body[0]).toHaveProperty("id");
            expect(body[0]).toHaveProperty("state");
            expect(body[0]).toHaveProperty("config");
        });
    });

    describe("POST /v1/apps/:app_name/machines", () => {
        it("should require config with image", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/machines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            expect(res.status).toBe(400);
            
            const body = await res.json();
            expect(body.error).toBe("Image is required in machine config");
        });

        it("should create a new machine with skip_launch", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/machines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config: { 
                        image: "nginx:alpine",
                        env: { TEST_VAR: "test_value" }
                    },
                    region: "local",
                    skip_launch: true,
                    name: "test-machine",
                }),
            });
            expect(res.status).toBe(201);
            
            const body = await res.json();
            expect(body).toHaveProperty("id");
            expect(body.name).toBe("test-machine");
            expect(body.state).toBe("stopped");
            expect(body.region).toBe("local");
            expect(body.config.image).toBe("nginx:alpine");
            expect(body.config.env.TEST_VAR).toBe("test_value");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/machines", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config: { image: "nginx:alpine" },
                    region: "local",
                }),
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });

    describe("GET /v1/apps/:app_name/machines/:machine_id", () => {
        it("should return machine details", async () => {
            // Create a test machine first
            const createRes = await app.request(`/v1/apps/${testAppName}/machines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config: { image: "nginx:alpine" },
                    region: "local",
                    skip_launch: true,
                    name: "detailed-machine",
                }),
            });
            const createBody = await createRes.json();
            const machineId = createBody.id;

            // Get machine details
            const res = await app.request(`/v1/apps/${testAppName}/machines/${machineId}`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body.id).toBe(machineId);
            expect(body.name).toBe("detailed-machine");
            expect(body.state).toBe("stopped");
            expect(body.config.image).toBe("nginx:alpine");
        });

        it("should return 404 for non-existent machine", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/machines/non-existent-machine`);
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("Machine not found");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/machines/any-machine");
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });

    describe("DELETE /v1/apps/:app_name/machines/:machine_id", () => {
        it("should delete existing machine", async () => {
            // Create a test machine first
            const createRes = await app.request(`/v1/apps/${testAppName}/machines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config: { image: "nginx:alpine" },
                    region: "local",
                    skip_launch: true,
                }),
            });
            const createBody = await createRes.json();
            const machineId = createBody.id;

            // Delete the machine
            const res = await app.request(`/v1/apps/${testAppName}/machines/${machineId}`, {
                method: "DELETE",
            });
            expect(res.status).toBe(204);

            // Verify machine is deleted
            const getRes = await app.request(`/v1/apps/${testAppName}/machines/${machineId}`);
            expect(getRes.status).toBe(404);
        });

        it("should return 404 for non-existent machine", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/machines/non-existent-machine`, {
                method: "DELETE",
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("Machine not found");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/machines/any-machine", {
                method: "DELETE",
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });

    describe("GET /v1/apps/:app_name/machines/:machine_id/events", () => {
        it("should return events for machine", async () => {
            // Create a test machine first (this will create events)
            const createRes = await app.request(`/v1/apps/${testAppName}/machines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config: { image: "nginx:alpine" },
                    region: "local",
                    skip_launch: true,
                }),
            });
            const createBody = await createRes.json();
            const machineId = createBody.id;

            // Get machine events
            const res = await app.request(`/v1/apps/${testAppName}/machines/${machineId}/events`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(Array.isArray(body)).toBe(true);
            expect(body.length).toBeGreaterThan(0);
            expect(body[0]).toHaveProperty("id");
            expect(body[0]).toHaveProperty("type");
            expect(body[0]).toHaveProperty("status");
            expect(body[0]).toHaveProperty("timestamp");
        });

        it("should return 404 for non-existent machine", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/machines/non-existent-machine/events`);
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("Machine not found");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/machines/any-machine/events");
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });
});