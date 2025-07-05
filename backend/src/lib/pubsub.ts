import { redis } from "bun";
import Redis from "iovalkey";

type Environment = "development" | "production" | "test";

export interface PubsubKeyFormats {
    noop: "noop";
}

export interface PubsubKeyValues {
    noop: string;
}

export function pubsubKey<Key extends keyof PubsubKeyFormats>(
    namespace: Key,
    value: PubsubKeyFormats[Key],
): `${Environment}:${Key}:${PubsubKeyFormats[Key]}` {
    return `${(process.env.NODE_ENV as Environment) ?? "development"}:${namespace}:${value}`;
}

export interface PubsubChannelFormats {
    user_auth_invalidated: number;
}

export function pubsubChannel<Key extends keyof PubsubChannelFormats>(
    namespace: Key,
    value: PubsubChannelFormats[Key],
): `${Environment}:${Key}:${PubsubChannelFormats[Key]}` {
    return `${(process.env.NODE_ENV as Environment) ?? "development"}:${namespace}:${value}`;
}

export const subscriberRedis = new Redis(process.env.VALKEY_URL!);

export function emitPubsubMessage<Key extends keyof PubsubMessages>(
    channel: Key,
    channelValue: PubsubChannelFormats[Key],
    message: PubsubMessages[Key],
) {
    return redis.send("PUBLISH", [
        pubsubChannel(channel, channelValue),
        JSON.stringify(message),
    ]);
}

export async function onPubsubMessage<Key extends keyof PubsubMessages>(
    channel: Key,
    channelValue: PubsubChannelFormats[Key],
    callback: (message: PubsubMessages[Key]) => void,
): Promise<() => Promise<void>> {
    const channelName = pubsubChannel(channel, channelValue);
    await subscriberRedis.subscribe(channelName);

    const onMessage = (channel: string, message: string) => {
        if (channel === channelName) {
            callback(JSON.parse(message) as PubsubMessages[Key]);
        }
    };

    subscriberRedis.addListener("message", onMessage);

    return async () => {
        subscriberRedis.removeListener("message", onMessage);
        await subscriberRedis.unsubscribe(channelName);
    };
}

export interface PubsubMessages {
    user_auth_invalidated: {
        sessionId: number;
    };
}
