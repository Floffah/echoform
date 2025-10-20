import { $ } from "bun";
import { resolve } from "path";
import type {
    ZodAny,
    ZodBoolean,
    ZodEnum,
    ZodLiteral,
    ZodNumber,
    ZodObject,
    ZodOptional,
    ZodString,
    ZodUnion,
} from "zod";

import { clientboundPacket } from "@/protocol/packet/clientbound.ts";

type AllowedTypes =
    | ZodString
    | ZodNumber
    | ZodLiteral
    | ZodObject
    | ZodBoolean
    | ZodEnum
    | ZodAny
    | ZodUnion;

function zodPrimitiveToOpenapiSchema(
    _prim: AllowedTypes | ZodOptional<AllowedTypes>,
) {
    const prim = _prim.type === "optional" ? _prim.def.innerType : _prim;

    if (prim.type === "string") {
        return {
            type: "string",
            description: prim.description,
        };
    } else if (prim.type === "number") {
        return {
            type: "number",
            description: prim.description,
        };
    } else if (prim.type === "literal") {
        return {
            type: typeof prim.value,
            const: prim.value,
            description: prim.description,
        };
    } else if (prim.type === "boolean") {
        return {
            type: "boolean",
            description: prim.description,
        };
    } else if (prim.type === "enum") {
        return {
            type: "string",
            enum: prim.options,
            description: prim.description,
        };
    } else if (prim.type === "any") {
        return {
            type: ["array", "string", "number", "object", "integer", "boolean"],
            description: prim.description,
        };
    } else if (prim.type === "union") {
        return {
            oneOf: prim.options.map(zodPrimitiveToOpenapiSchema as any),
        };
    } else if (prim.type === "object") {
        return {
            type: "object",
            additionalProperties: false,
            description: prim.description,
            properties: Object.fromEntries(
                Object.entries(prim.shape)
                    .map(([key, val]) => {
                        const schema = zodPrimitiveToOpenapiSchema(
                            val,
                        ) as Record<string, any>;

                        if (!schema) return schema;

                        return [key, schema];
                    })
                    .filter(Boolean)
                    .filter(([key]) => key !== "sentAt"),
            ),
        };
    }

    return null;
}

const asyncapiDocument: any = {
    asyncapi: "3.0.0",
    info: {
        title: "Echoform Authoritative Server",
        version: "0.0.1",
        description:
            "This is the authoritative server for Echoform, a cozy MMORPG game.",
    },
    servers: {
        production: {
            host: "echoform.floffah.dev",
            pathname: "/client",
            protocol: "wss",
        },
    },
    channels: {
        client: {
            servers: [
                {
                    $ref: "#/servers/production",
                },
            ],
            address: "/client",
            summary: "WebSocket connection for game clients",
            bindings: {
                ws: {
                    headers: {
                        type: "object",
                        properties: {
                            Device: {
                                type: "string",
                                description: "Client device information",
                            },
                        },
                    },
                },
            },
            messages: Object.fromEntries(
                clientboundPacket.options.map((packet) => [
                    packet.shape.id.value,
                    {
                        $ref: `#/components/messages/${packet.shape.id.value}`,
                    },
                ]),
            ),
        },
    },
    components: {
        messages: Object.fromEntries(
            clientboundPacket.options.map((packet) => [
                packet.shape.id.value,
                {
                    title: `${packet.shape.id.value}Packet`,
                    summary: packet.description,
                    payload: {
                        $ref: `#/components/schemas/${packet.shape.id.value}PacketPayload`,
                    },
                },
            ]),
        ),
        schemas: Object.fromEntries(
            clientboundPacket.options.map((packet) => [
                `${packet.shape.id.value}PacketPayload`,
                zodPrimitiveToOpenapiSchema(packet) as Record<string, any>,
            ]),
        ),
    },
};

const unoptimizedDoc = Bun.YAML.stringify(asyncapiDocument, null, 2);

await Bun.write(
    resolve(import.meta.dir, "../asyncapi.yaml"),
    "# AUTO GENERATED - DO NOT EDIT\n\n" + unoptimizedDoc,
);

console.debug("Wrote asyncapi yaml");

await $`zsh -c 'asyncapi optimize asyncapi.yaml --optimization=remove-components --optimization=reuse-components --optimization=move-duplicates-to-components --optimization=move-all-to-components --no-tty --output=overwrite'`;
