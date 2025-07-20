import { docker } from "./docker";
import { logger } from "./logger";

export class LocalRegistry {
    private registryPort = 5000;
    private registryContainer: any;

    async start(): Promise<void> {
        try {
            // Check if registry is already running
            const containers = await docker.listContainers({
                filters: { label: ["localfly.service=registry"] },
            });

            if (containers.length > 0) {
                logger.info("Local Docker registry already running");
                return;
            }

            // Start local Docker registry
            this.registryContainer = await docker.createContainer({
                Image: "registry:2",
                name: "localfly-registry",
                ExposedPorts: { "5000/tcp": {} },
                HostConfig: {
                    PortBindings: {
                        "5000/tcp": [{ HostPort: this.registryPort.toString() }],
                    },
                    RestartPolicy: { Name: "unless-stopped" },
                },
                Labels: {
                    "localfly.service": "registry",
                },
                Env: [
                    "REGISTRY_STORAGE_DELETE_ENABLED=true",
                    "REGISTRY_HTTP_ADDR=0.0.0.0:5000",
                ],
            });

            await this.registryContainer.start();
            logger.info(`Local Docker registry started on port ${this.registryPort}`);
        } catch (error) {
            logger.error(`Failed to start local registry: ${String(error)}`);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            if (this.registryContainer) {
                await this.registryContainer.stop();
                await this.registryContainer.remove();
                logger.info("Local Docker registry stopped");
            }
        } catch (error) {
            logger.error(`Failed to stop local registry: ${String(error)}`);
        }
    }

    async tagAndPush(sourceImage: string, targetName: string): Promise<string> {
        try {
            const localImage = `localhost:${this.registryPort}/${targetName}`;
            
            // Tag the image for local registry
            const image = docker.getImage(sourceImage);
            await image.tag({ repo: `localhost:${this.registryPort}/${targetName}` });
            
            // Push to local registry
            const stream = await docker.getImage(localImage).push();
            
            return new Promise((resolve, reject) => {
                docker.modem.followProgress(stream, (err: Error | null, res: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        logger.info(`Successfully pushed ${sourceImage} to local registry as ${localImage}`);
                        resolve(localImage);
                    }
                });
            });
        } catch (error) {
            logger.error(`Failed to tag and push image: ${String(error)}`);
            throw error;
        }
    }

    async pullFromLocal(imageName: string): Promise<void> {
        try {
            const localImage = `localhost:${this.registryPort}/${imageName}`;
            const stream = await docker.pull(localImage);
            
            return new Promise((resolve, reject) => {
                docker.modem.followProgress(stream, (err: Error | null, res: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        logger.info(`Successfully pulled ${localImage} from local registry`);
                        resolve();
                    }
                });
            });
        } catch (error) {
            logger.error(`Failed to pull from local registry: ${String(error)}`);
            throw error;
        }
    }

    getRegistryUrl(): string {
        return `localhost:${this.registryPort}`;
    }

    async listImages(): Promise<any[]> {
        try {
            // Simple HTTP request to registry API
            const response = await fetch(`http://localhost:${this.registryPort}/v2/_catalog`);
            if (!response.ok) {
                throw new Error(`Registry API error: ${response.status}`);
            }
            const data = await response.json();
            return data.repositories || [];
        } catch (error) {
            logger.error(`Failed to list registry images: ${String(error)}`);
            return [];
        }
    }
}

export const localRegistry = new LocalRegistry();