import { Hono } from "hono";
import { localRegistry } from "@/lib/registry";
import { logger } from "@/lib/logger";

export const registryHono = new Hono();

// List images in local registry
registryHono.get("/registry/images", async (c) => {
    try {
        const images = await localRegistry.listImages();
        return c.json({ images });
    } catch (error) {
        logger.error(`Failed to list registry images: ${String(error)}`);
        return c.json({ error: "Failed to list images" }, 500);
    }
});

// Push image to local registry
registryHono.post("/registry/push", async (c) => {
    try {
        const { sourceImage, targetName } = await c.req.json();
        
        if (!sourceImage || !targetName) {
            return c.json({ error: "sourceImage and targetName are required" }, 400);
        }

        const localImage = await localRegistry.tagAndPush(sourceImage, targetName);
        return c.json({ 
            message: "Image pushed successfully",
            localImage,
            registryUrl: localRegistry.getRegistryUrl()
        });
    } catch (error) {
        logger.error(`Failed to push image: ${String(error)}`);
        return c.json({ error: "Failed to push image" }, 500);
    }
});

// Pull image from local registry
registryHono.post("/registry/pull", async (c) => {
    try {
        const { imageName } = await c.req.json();
        
        if (!imageName) {
            return c.json({ error: "imageName is required" }, 400);
        }

        await localRegistry.pullFromLocal(imageName);
        return c.json({ message: "Image pulled successfully" });
    } catch (error) {
        logger.error(`Failed to pull image: ${String(error)}`);
        return c.json({ error: "Failed to pull image" }, 500);
    }
});

// Get registry status
registryHono.get("/registry/status", async (c) => {
    try {
        const images = await localRegistry.listImages();
        return c.json({
            status: "running",
            url: localRegistry.getRegistryUrl(),
            imageCount: images.length,
        });
    } catch (error) {
        return c.json({
            status: "error",
            error: String(error),
        }, 500);
    }
});