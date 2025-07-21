import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import app from "../index.ts";

describe("Apps API", () => {
    beforeAll(async () => {
        // Setup test database if needed
    });

    afterAll(async () => {
        // Cleanup test database if needed
    });

    describe("GET /v1/apps", () => {
        it("should require org_slug parameter", async () => {
            const res = await app.request("/v1/apps");
            expect(res.status).toBe(400);
            
            const body = await res.json();
            expect(body.error).toBe("org_slug is required");
        });

        it("should return empty array for non-existent org", async () => {
            const res = await app.request("/v1/apps?org_slug=test-org");
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(Array.isArray(body)).toBe(true);
            expect(body.length).toBe(0);
        });
    });

    describe("POST /v1/apps", () => {
        it("should require app_name and org_slug", async () => {
            const res = await app.request("/v1/apps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            expect(res.status).toBe(400);
            
            const body = await res.json();
            expect(body.error).toBe("app_name and org_slug are required");
        });

        it("should create a new app", async () => {
            const res = await app.request("/v1/apps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    app_name: "test-app",
                    org_slug: "test-org",
                }),
            });
            expect(res.status).toBe(201);
        });

        it("should not allow duplicate app names", async () => {
            // Try to create the same app again
            const res = await app.request("/v1/apps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    app_name: "test-app",
                    org_slug: "test-org",
                }),
            });
            expect(res.status).toBe(400);
            
            const body = await res.json();
            expect(body.error).toBe("App already exists");
        });
    });

    describe("GET /v1/apps/:app_name", () => {
        it("should return app details", async () => {
            const res = await app.request("/v1/apps/test-app");
            expect(res.status).toBe(200);
            
            const body = await res.json();
            expect(body.name).toBe("test-app");
            expect(body.organization.slug).toBe("test-org");
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app");
            expect(res.status).toBe(404);
        });
    });

    describe("DELETE /v1/apps/:app_name", () => {
        it("should delete an existing app", async () => {
            const res = await app.request("/v1/apps/test-app", {
                method: "DELETE",
            });
            expect(res.status).toBe(204);
        });

        it("should return 404 for non-existent app", async () => {
            const res = await app.request("/v1/apps/non-existent-app", {
                method: "DELETE",
            });
            expect(res.status).toBe(404);
        });
    });
});