import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import app from "../index.ts";
import { db } from "../db/index.ts";
import { apps, volumes } from "../db/schema/index.ts";
import { eq } from "drizzle-orm";

describe("Volumes API", () => {
    let testAppId: number;
    const testAppName = "test-volumes-app";
    const testOrgSlug = "test-volumes-org";

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
        await db.delete(volumes).where(eq(volumes.appId, testAppId));
        await db.delete(apps).where(eq(apps.id, testAppId));
    });

    beforeEach(async () => {
        // Clean up volumes before each test
        await db.delete(volumes).where(eq(volumes.appId, testAppId));
    });

    describe("GET /v1/apps/:app_name/volumes", () => {
        it("should return empty array for app with no volumes", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/volumes`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(Array.isArray(body)).toBe(true);
            expect(body.length).toBe(0);
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/volumes");
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });

        it("should list volumes for app", async () => {
            // Create a test volume first
            const createRes = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "test-volume",
                    size_gb: 1,
                    region: "local",
                }),
            });
            expect(createRes.status).toBe(201);

            // List volumes
            const res = await app.request(`/v1/apps/${testAppName}/volumes`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(Array.isArray(body)).toBe(true);
            expect(body.length).toBe(1);
            expect(body[0]).toHaveProperty("id");
            expect(body[0]).toHaveProperty("name", "test-volume");
            expect(body[0]).toHaveProperty("size_gb", 1);
            expect(body[0]).toHaveProperty("state", "created");
            expect(body[0]).toHaveProperty("blocks");
            expect(body[0]).toHaveProperty("blocks_avail");
        });

        it("should support summary query parameter", async () => {
            // Create a test volume first
            const createRes = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "summary-volume",
                    size_gb: 2,
                    region: "local",
                }),
            });
            expect(createRes.status).toBe(201);

            // List volumes with summary
            const res = await app.request(`/v1/apps/${testAppName}/volumes?summary=true`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(Array.isArray(body)).toBe(true);
            expect(body.length).toBe(1);
            expect(body[0]).toHaveProperty("id");
            expect(body[0]).toHaveProperty("name", "summary-volume");
            expect(body[0]).toHaveProperty("size_gb", 2);
            // Summary response shouldn't have block details
            expect(body[0]).not.toHaveProperty("blocks");
            expect(body[0]).not.toHaveProperty("blocks_avail");
        });
    });

    describe("POST /v1/apps/:app_name/volumes", () => {
        it("should require name and size_gb", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            expect(res.status).toBe(400);
            
            const body = await res.json();
            expect(body.error).toBe("Volume name and size_gb are required");
        });

        it("should create a new volume", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "new-volume",
                    size_gb: 5,
                    region: "local",
                    encrypted: true,
                    fstype: "xfs",
                }),
            });
            expect(res.status).toBe(201);
            
            const body = await res.json();
            expect(body).toHaveProperty("id");
            expect(body.name).toBe("new-volume");
            expect(body.size_gb).toBe(5);
            expect(body.region).toBe("local");
            expect(body.encrypted).toBe(true);
            expect(body.fstype).toBe("xfs");
            expect(body.state).toBe("created");
            expect(body.blocks).toBeGreaterThan(0);
        });

        it("should create volume with default values", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "default-volume",
                    size_gb: 1,
                }),
            });
            expect(res.status).toBe(201);
            
            const body = await res.json();
            expect(body.region).toBe("local");
            expect(body.encrypted).toBe(false);
            expect(body.fstype).toBe("ext4");
        });

        it("should not allow duplicate volume names", async () => {
            // Create first volume
            const createRes = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "duplicate-volume",
                    size_gb: 1,
                }),
            });
            expect(createRes.status).toBe(201);

            // Try to create duplicate
            const res = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "duplicate-volume",
                    size_gb: 2,
                }),
            });
            expect(res.status).toBe(400);
            
            const body = await res.json();
            expect(body.error).toBe("Volume with this name already exists");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/volumes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "test-volume",
                    size_gb: 1,
                }),
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });

    describe("GET /v1/apps/:app_name/volumes/:volume_id", () => {
        it("should return volume details", async () => {
            // Create a test volume first
            const createRes = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "detail-volume",
                    size_gb: 3,
                    region: "local",
                }),
            });
            const createBody = await createRes.json();
            const volumeId = createBody.id;

            // Get volume details
            const res = await app.request(`/v1/apps/${testAppName}/volumes/${volumeId}`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body.id).toBe(volumeId);
            expect(body.name).toBe("detail-volume");
            expect(body.size_gb).toBe(3);
            expect(body.region).toBe("local");
            expect(body).toHaveProperty("blocks");
            expect(body).toHaveProperty("fstype");
        });

        it("should return 404 for non-existent volume", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/volumes/non-existent-volume`);
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("Volume not found");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/volumes/any-volume");
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });

    describe("DELETE /v1/apps/:app_name/volumes/:volume_id", () => {
        it("should delete existing volume", async () => {
            // Create a test volume first
            const createRes = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "delete-volume",
                    size_gb: 1,
                }),
            });
            const createBody = await createRes.json();
            const volumeId = createBody.id;

            // Delete the volume
            const res = await app.request(`/v1/apps/${testAppName}/volumes/${volumeId}`, {
                method: "DELETE",
            });
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body.id).toBe(volumeId);
            expect(body.state).toBe("destroying");

            // Verify volume is deleted
            const getRes = await app.request(`/v1/apps/${testAppName}/volumes/${volumeId}`);
            expect(getRes.status).toBe(404);
        });

        it("should return 404 for non-existent volume", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/volumes/non-existent-volume`, {
                method: "DELETE",
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("Volume not found");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/volumes/any-volume", {
                method: "DELETE",
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });

    describe("POST /v1/apps/:app_name/volumes/:volume_id/extend", () => {
        it("should extend volume size", async () => {
            // Create a test volume first
            const createRes = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "extend-volume",
                    size_gb: 1,
                }),
            });
            const createBody = await createRes.json();
            const volumeId = createBody.id;

            // Extend the volume
            const res = await app.request(`/v1/apps/${testAppName}/volumes/${volumeId}/extend`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    size_gb: 5,
                }),
            });
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body).toHaveProperty("needs_restart", false);
            expect(body).toHaveProperty("volume");
            expect(body.volume.id).toBe(volumeId);
            expect(body.volume.size_gb).toBe(5);
            expect(body.volume.blocks).toBeGreaterThan(createBody.blocks);
        });

        it("should require new size to be greater than current", async () => {
            // Create a test volume first
            const createRes = await app.request(`/v1/apps/${testAppName}/volumes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "extend-volume-fail",
                    size_gb: 5,
                }),
            });
            const createBody = await createRes.json();
            const volumeId = createBody.id;

            // Try to extend to same or smaller size
            const res = await app.request(`/v1/apps/${testAppName}/volumes/${volumeId}/extend`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    size_gb: 3,
                }),
            });
            expect(res.status).toBe(400);
            
            const body = await res.json();
            expect(body.error).toBe("New size must be greater than current size");
        });

        it("should return 404 for non-existent volume", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/volumes/non-existent-volume/extend`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    size_gb: 10,
                }),
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("Volume not found");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/volumes/any-volume/extend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    size_gb: 10,
                }),
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });
});