import { Hono } from "hono";

import { appsHono } from "./routes/apps.ts";
import { machinesHono } from "./routes/machines.ts";
import { registryHono } from "./routes/registry.ts";
import { logger } from "./lib/logger.ts";
import { localRegistry } from "./lib/registry.ts";

const app = new Hono();
const v1 = new Hono();

v1.route("/apps", appsHono);
v1.route("/apps", machinesHono);
v1.route("/", registryHono);

app.route("/v1", v1);

// Start server
const port = process.env.PORT || 3000;

// Initialize local registry
localRegistry.start().catch((error) => {
    logger.error(`Failed to start local registry: ${String(error)}`);
});

export default {
  port,
  fetch: app.fetch,
};

logger.debug(`Started development server: http://localhost:${port}`);
