import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import app from "../index.ts";
import { db } from "../db/index.ts";
import { apps, secrets } from "../db/schema/index.ts";
import { eq } from "drizzle-orm";

describe("Secrets API", () => {
    let testAppId: number;
    const testAppName = "test-secrets-app";
    const testOrgSlug = "test-secrets-org";

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
        await db.delete(secrets).where(eq(secrets.appId, testAppId));
        await db.delete(apps).where(eq(apps.id, testAppId));
    });

    beforeEach(async () => {
        // Clean up secrets before each test
        await db.delete(secrets).where(eq(secrets.appId, testAppId));
    });

    describe("GET /v1/apps/:app_name/secrets", () => {
        it("should return empty secrets array for app with no secrets", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/secrets`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body).toHaveProperty("secrets");
            expect(Array.isArray(body.secrets)).toBe(true);
            expect(body.secrets.length).toBe(0);
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/secrets");
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });

        it("should list secrets for app", async () => {
            // Create a test secret first
            const createRes = await app.request(`/v1/apps/${testAppName}/secrets/test-secret`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    value: "secret-value",
                }),
            });
            expect(createRes.status).toBe(200);

            // List secrets
            const res = await app.request(`/v1/apps/${testAppName}/secrets`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body).toHaveProperty("secrets");
            expect(Array.isArray(body.secrets)).toBe(true);
            expect(body.secrets.length).toBe(1);
            expect(body.secrets[0]).toHaveProperty("name", "test-secret");
            expect(body.secrets[0]).toHaveProperty("digest");
            expect(body.secrets[0].digest).toBeTruthy();
        });
    });

    describe("POST /v1/apps/:app_name/secrets/:secret_name", () => {
        it("should require secret value", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/secrets/test-secret`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            expect(res.status).toBe(400);
            
            const body = await res.json();
            expect(body.error).toBe("Secret value is required");
        });

        it("should create a new secret", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/secrets/new-secret`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    value: "my-secret-value",
                }),
            });
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body.success).toBe(true);
        });

        it("should update existing secret", async () => {
            // Create initial secret
            const createRes = await app.request(`/v1/apps/${testAppName}/secrets/update-secret`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    value: "initial-value",
                }),
            });
            expect(createRes.status).toBe(200);

            // Update secret
            const updateRes = await app.request(`/v1/apps/${testAppName}/secrets/update-secret`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    value: "updated-value",
                }),
            });
            expect(updateRes.status).toBe(200);
            
            const body = await updateRes.json();
            expect(body.success).toBe(true);
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/secrets/test-secret", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    value: "secret-value",
                }),
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });

    describe("GET /v1/apps/:app_name/secrets/:secret_name", () => {
        it("should return secret metadata", async () => {
            // Create a test secret first
            const createRes = await app.request(`/v1/apps/${testAppName}/secrets/get-secret`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    value: "secret-to-get",
                }),
            });
            expect(createRes.status).toBe(200);

            // Get secret metadata
            const res = await app.request(`/v1/apps/${testAppName}/secrets/get-secret`);
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body.name).toBe("get-secret");
            expect(body).toHaveProperty("digest");
            expect(body.digest).toBeTruthy();
        });

        it("should return 404 for non-existent secret", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/secrets/non-existent-secret`);
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("Secret not found");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/secrets/any-secret");
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });

    describe("DELETE /v1/apps/:app_name/secrets/:secret_name", () => {
        it("should delete existing secret", async () => {
            // Create a test secret first
            const createRes = await app.request(`/v1/apps/${testAppName}/secrets/delete-secret`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    value: "secret-to-delete",
                }),
            });
            expect(createRes.status).toBe(200);

            // Delete the secret
            const res = await app.request(`/v1/apps/${testAppName}/secrets/delete-secret`, {
                method: "DELETE",
            });
            expect(res.status).toBe(204);

            // Verify secret is deleted
            const getRes = await app.request(`/v1/apps/${testAppName}/secrets/delete-secret`);
            expect(getRes.status).toBe(404);
        });

        it("should return 404 for non-existent secret", async () => {
            const res = await app.request(`/v1/apps/${testAppName}/secrets/non-existent-secret`, {
                method: "DELETE",
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("Secret not found");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app/secrets/any-secret", {
                method: "DELETE",
            });
            expect(res.status).toBe(404);
            
            const body = await res.json();
            expect(body.error).toBe("App not found");
        });
    });
});