import { z } from "zod";

import { clientboundPacket } from "@/protocol/packet/clientbound.ts";
import { serverboundPacket } from "@/protocol/packet/serverbound.ts";

export const packet = z.union([clientboundPacket, serverboundPacket]);

export type Packet = z.infer<typeof packet>;
