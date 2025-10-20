import { app } from "@/index.ts";

console.log("Creating default user");

await Promise.try(() => app
    .request("/v1/user/register", {
        method: "POST",
        body: JSON.stringify({
            username: "floffah",
            password: "password",
        }),
        headers: { "content-type": "application/json" },
    }))
    .then((res) => console.log("Register user status:", res.status, res.statusText))

console.log("Complete!");

process.exit(0);
