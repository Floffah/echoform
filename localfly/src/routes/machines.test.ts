import { describe, test, expect, beforeAll } from "bun:test";

const BASE_URL = "http://localhost:3000/v1";

describe("Localfly API", () => {
    let testApp: any;
    let testMachine: any;

    beforeAll(async () => {
        // Clean up any existing test data
        try {
            await fetch(`${BASE_URL}/apps/test-localfly-app/machines`, {
                method: "DELETE",
            }).catch(() => {});
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    test("should create an app", async () => {
        const response = await fetch(`${BASE_URL}/apps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                app_name: "test-localfly-app",
                org_slug: "test-org",
            }),
        });

        expect(response.status).toBe(201);
    });

    test("should list apps", async () => {
        const response = await fetch(`${BASE_URL}/apps?org_slug=test-org`);
        const apps = await response.json();

        expect(response.status).toBe(200);
        expect(Array.isArray(apps)).toBe(true);
        
        const testApp = apps.find((app: any) => app.name === "test-localfly-app");
        expect(testApp).toBeDefined();
        expect(testApp.orgSlug).toBe("test-org");
    });

    test("should create a machine", async () => {
        const response = await fetch(`${BASE_URL}/apps/test-localfly-app/machines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "test-machine",
                config: {
                    image: "alpine:latest",
                    env: { TEST_VAR: "test-value" },
                },
                skip_launch: true,
            }),
        });

        testMachine = await response.json();
        
        expect(response.status).toBe(200);
        expect(testMachine.id).toBeDefined();
        expect(testMachine.name).toBe("test-machine");
        expect(testMachine.state).toBe("created");
        expect(testMachine.image_ref.repository).toBe("alpine:latest");
    });

    test("should list machines", async () => {
        const response = await fetch(`${BASE_URL}/apps/test-localfly-app/machines`);
        const machines = await response.json();

        expect(response.status).toBe(200);
        expect(Array.isArray(machines)).toBe(true);
        expect(machines.length).toBeGreaterThan(0);
        
        const machine = machines.find((m: any) => m.name === "test-machine");
        expect(machine).toBeDefined();
    });

    test("should get machine details", async () => {
        const response = await fetch(`${BASE_URL}/apps/test-localfly-app/machines/${testMachine.id}`);
        const machine = await response.json();

        expect(response.status).toBe(200);
        expect(machine.id).toBe(testMachine.id);
        expect(machine.name).toBe("test-machine");
    });

    test("should start machine", async () => {
        const response = await fetch(
            `${BASE_URL}/apps/test-localfly-app/machines/${testMachine.id}/start`,
            { method: "POST" }
        );

        expect(response.status).toBe(200);

        // Check machine state changed
        const machineResponse = await fetch(
            `${BASE_URL}/apps/test-localfly-app/machines/${testMachine.id}`
        );
        const machine = await machineResponse.json();
        expect(machine.state).toBe("started");
    });
});