#!/usr/bin/env bun
import { serve } from "bun";
import app from "./index.ts";
import { logger } from "./lib/logger.ts";

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

serve({
    fetch: app.fetch,
    port,
});

logger.info(`LocalFly API server started on port ${port}`);
logger.info("Available endpoints:");
logger.info("  GET  /v1/apps?org_slug=<org> - List apps");
logger.info("  POST /v1/apps - Create app");
logger.info("  GET  /v1/apps/<app> - Get app details");
logger.info("  DELETE /v1/apps/<app> - Delete app");
logger.info("  GET  /v1/apps/<app>/machines - List machines");
logger.info("  POST /v1/apps/<app>/machines - Create machine");
logger.info("  GET  /v1/apps/<app>/volumes - List volumes");
logger.info("  POST /v1/apps/<app>/volumes - Create volume");
logger.info("  GET  /v1/apps/<app>/secrets - List secrets");
logger.info("  POST /v1/apps/<app>/secrets/<name> - Set secret");