import type { WSContext } from "hono/ws";

import type { defineHandler } from "@/lib/defineHandler.ts";
import type { GameClientConnection } from "@/protocol/GameClientConnection.ts";
import { clientDeclaration } from "@/protocol/handlers/client_declaration.ts";
import { clientReady } from "@/protocol/handlers/client_ready.ts";
import type { ServerboundPacket } from "@/protocol/packet/serverbound.ts";

export interface GameClientConnectionHandler<
    ID extends ServerboundPacket["id"],
> {
    (
        message: ServerboundPacket & { id: ID },
        conn: GameClientConnection,
        ws: WSContext,
    ): void | Promise<void>;
}

export const handlers: Partial<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Record<ServerboundPacket["id"], ReturnType<typeof defineHandler<any>>>
> = {
    client_declaration: clientDeclaration,
    client_ready: clientReady,
};
