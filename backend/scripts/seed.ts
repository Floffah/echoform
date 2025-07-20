#!/usr/bin/env bun

import { seedCosmetics } from "./seedCosmetics";

console.log("Seeding cosmetics...");
await seedCosmetics();
console.log("Done!");