import { WSContext, type WSMessageReceive } from "hono/ws";
import type { WSEvents } from "hono/ws";

export interface AwaitedWSEvents<T = unknown> extends WSEvents<T> {
    onOpen?: (evt: Event, ws: WSContext<T>) => void | Promise<void>;
    onMessage?: (
        evt: MessageEvent<WSMessageReceive>,
        ws: WSContext<T>,
    ) => void | Promise<void>;
    onClose?: (evt: CloseEvent, ws: WSContext<T>) => void | Promise<void>;
    onError?: (evt: Event, ws: WSContext<T>) => void | Promise<void>;
}
