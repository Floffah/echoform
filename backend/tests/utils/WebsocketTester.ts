import {
    type SendOptions,
    WSContext,
    type WSMessageReceive,
    type WSReadyState,
} from "hono/ws";
import { EventEmitter } from "node:events";
import type TypedEmitter from "typed-emitter";

import type { GameClientConnection } from "@/protocol/GameClientConnection.ts";
import type { ClientboundPacket } from "@/protocol/packet/clientbound.ts";
import type { ServerboundPacket } from "@/protocol/packet/serverbound.ts";

type WebsocketTesterEvents = {
    // If closed by the client OR server
    closed: (code?: number, reason?: string) => void;
};

export class WebsocketTester extends (EventEmitter as new () => TypedEmitter<WebsocketTesterEvents>) {
    outboundPackets: ClientboundPacket[] = [];

    constructor(public conn: GameClientConnection) {
        super();
    }

    private _wsContext(readyState: WSReadyState = 0): WSContext {
        return new WSContext({
            send: (
                data: string | ArrayBuffer | Uint8Array,
                _options: SendOptions,
            ) => {
                if (typeof data === "string") {
                    const packet = JSON.parse(data) as ClientboundPacket;
                    this.outboundPackets.push(packet);
                }
            },
            close: (code?: number, reason?: string) => {
                if (readyState !== 1) {
                    throw new Error("WebSocket is not open");
                }

                this.emit("closed", code, reason);

                return this.conn.onClose?.(
                    new CloseEvent("close", {
                        code: code,
                        reason: reason,
                    }),
                    this._wsContext(readyState),
                );
            },
            readyState,
        });
    }

    open() {
        return this.conn.onOpen?.(new Event("open"), this._wsContext(1));
    }

    message(data: ServerboundPacket) {
        return this.conn.onMessage?.(
            new MessageEvent<WSMessageReceive>("message", {
                data: JSON.stringify(data),
            }),
            this._wsContext(1),
        );
    }

    close(code?: number, reason?: string) {
        this.emit("closed", code, reason);

        return this.conn.onClose?.(
            new CloseEvent("close", {
                code,
                reason,
            }),
            this._wsContext(1),
        );
    }
}
