import { Hono } from "hono";

import { appsHono } from "./routes/apps.ts";

const app = new Hono();
const v1 = new Hono();

v1.route("/apps", appsHono);

app.route("/v1", v1);

export default app;
