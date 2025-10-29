import { RedisClient, redis as bunRedis } from "bun";

type Environment = "development" | "production" | "test";

export const redisSubscriber = new RedisClient();
export const redis = bunRedis;

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

export function emitPubsubMessage<Key extends keyof PubsubMessages>(
    channel: Key,
    channelValue: PubsubChannelFormats[Key],
    message: PubsubMessages[Key],
) {
    return bunRedis.publish(
        pubsubChannel(channel, channelValue),
        JSON.stringify(message),
    );
}

export async function onPubsubMessage<Key extends keyof PubsubMessages>(
    channel: Key,
    channelValue: PubsubChannelFormats[Key],
    callback: (message: PubsubMessages[Key]) => void,
): Promise<() => Promise<void>> {
    const channelName = pubsubChannel(channel, channelValue);

    const onMessage = (message: string, channel: string) => {
        if (channel === channelName) {
            callback(JSON.parse(message) as PubsubMessages[Key]);
        }
    };

    await redisSubscriber.subscribe(channelName, onMessage);

    return async () => {
        await redisSubscriber.unsubscribe(channelName, onMessage);
    };
}

export interface PubsubMessages {
    user_auth_invalidated: {
        sessionId: number;
    };
}
