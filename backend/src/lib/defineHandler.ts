import type { GameClientConnectionHandler } from "@/protocol/handlers";
import type { ServerboundPacket } from "@/protocol/packet/serverbound.ts";

export function defineHandler<Id extends ServerboundPacket["id"]>(
    id: Id,
    handler: GameClientConnectionHandler<Id>,
) {
    return {
        id,
        handler,
    };
}
