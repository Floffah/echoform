import { Hono } from "hono";

import { appsHono } from "./routes/apps.ts";
import { machinesHono } from "./routes/machines.ts";
import { volumesHono } from "./routes/volumes.ts";
import { secretsHono } from "./routes/secrets.ts";

const app = new Hono();
const v1 = new Hono();

v1.route("/apps", appsHono);
v1.route("/apps", machinesHono);
v1.route("/apps", volumesHono);
v1.route("/apps", secretsHono);

app.route("/v1", v1);

export default app;
