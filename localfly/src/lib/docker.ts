import Dockerode from "dockerode";
import { logger } from "./logger.ts";

export const docker = new Dockerode();

export interface ContainerConfig {
    image: string;
    name?: string;
    env?: string[];
    labels?: Record<string, string>;
    exposedPorts?: Record<string, object>;
    hostConfig?: Dockerode.HostConfig;
}

export class DockerService {
    async createContainer(config: ContainerConfig): Promise<Dockerode.Container> {
        try {
            logger.info(`Creating container with image: ${config.image}`);
            
            // Ensure image exists locally
            await this.pullImageIfNeeded(config.image);
            
            const container = await docker.createContainer({
                Image: config.image,
                name: config.name,
                Env: config.env,
                Labels: {
                    "localfly.managed": "true",
                    ...config.labels,
                },
                ExposedPorts: config.exposedPorts,
                HostConfig: config.hostConfig,
            });

            logger.info(`Created container: ${container.id}`);
            return container;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to create container: ${errorMessage}`);
            throw error;
        }
    }

    async startContainer(containerId: string): Promise<void> {
        try {
            const container = docker.getContainer(containerId);
            await container.start();
            logger.info(`Started container: ${containerId}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to start container ${containerId}: ${errorMessage}`);
            throw error;
        }
    }

    async stopContainer(containerId: string, timeout = 10): Promise<void> {
        try {
            const container = docker.getContainer(containerId);
            await container.stop({ t: timeout });
            logger.info(`Stopped container: ${containerId}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to stop container ${containerId}: ${errorMessage}`);
            throw error;
        }
    }

    async removeContainer(containerId: string, force = false): Promise<void> {
        try {
            const container = docker.getContainer(containerId);
            await container.remove({ force });
            logger.info(`Removed container: ${containerId}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to remove container ${containerId}: ${errorMessage}`);
            throw error;
        }
    }

    async getContainerInfo(containerId: string): Promise<Dockerode.ContainerInspectInfo> {
        try {
            const container = docker.getContainer(containerId);
            return await container.inspect();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to inspect container ${containerId}: ${errorMessage}`);
            throw error;
        }
    }

    async listContainers(filters?: { label?: string[] }): Promise<Dockerode.ContainerInfo[]> {
        try {
            const options: Dockerode.ListContainersOptions = { all: true };
            if (filters?.label) {
                options.filters = { label: filters.label };
            }
            return await docker.listContainers(options);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to list containers: ${errorMessage}`);
            throw error;
        }
    }

    private async pullImageIfNeeded(image: string): Promise<void> {
        try {
            // Check if image exists locally
            try {
                await docker.getImage(image).inspect();
                logger.debug(`Image ${image} already exists locally`);
                return;
            } catch {
                // Image doesn't exist, pull it
                logger.info(`Pulling image: ${image}`);
                const stream = await docker.pull(image);
                
                // Wait for pull to complete
                await new Promise((resolve, reject) => {
                    docker.modem.followProgress(stream, (err, res) => {
                        if (err) reject(err);
                        else resolve(res);
                    });
                });
                
                logger.info(`Successfully pulled image: ${image}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to pull image ${image}: ${errorMessage}`);
            throw error;
        }
    }
}

export const dockerService = new DockerService();
