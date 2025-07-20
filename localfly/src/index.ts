import { Hono } from "hono";

import { appsHono } from "./routes/apps.ts";
import { machinesHono } from "./routes/machines.ts";
import { logger } from "./lib/logger.ts";

const app = new Hono();
const v1 = new Hono();

v1.route("/apps", appsHono);
v1.route("/apps", machinesHono);

app.route("/v1", v1);

// Start server
const port = process.env.PORT || 3000;

export default {
  port,
  fetch: app.fetch,
};

logger.debug(`Started development server: http://localhost:${port}`);
