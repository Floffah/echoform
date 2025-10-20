import type { WSContext, WSMessageReceive } from "hono/ws";

import { AUTH_TIMEOUT } from "@/constants/timeouts.ts";
import { type User, type UserSession, db } from "@/db";
import type { EnforcedStateName } from "@/enums/EnforcedStateName.ts";
import { ErrorCode, WarningCode } from "@/enums/ErrorCode.ts";
import { KickReason } from "@/enums/KickReason.ts";
import { logger } from "@/lib/logger.ts";
import { onPubsubMessage } from "@/lib/pubsub.ts";
import { GameClientConnectionState } from "@/protocol/GameClientConnectionState.ts";
import { handlers } from "@/protocol/handlers";
import type { ClientboundPacket } from "@/protocol/packet/clientbound.ts";
import { serverboundPacket } from "@/protocol/packet/serverbound.ts";
import type { AwaitedWSEvents } from "@/types/WSEvents.ts";

export class GameClientConnection implements AwaitedWSEvents {
    state = GameClientConnectionState.BANNER;
    clientReady = false;

    session?: UserSession | null = null;
    user?: User | null = null;

    _authTimeout: NodeJS.Timeout | null = null;
    _unsubscribeAuthInvalidation: (() => Promise<void>) | null = null;

    cachedEnforcedState: Partial<Record<EnforcedStateName, boolean>> = {};

    constructor(
        public connectionId: string,
        private headers = new Headers(),
    ) {}

    public async onOpen(_e: Event, ws: WSContext) {
        const device = this.headers.get("device");

        if (
            process.env.NODE_ENV === "production" &&
            (!device ||
                !device.includes("EchoformMMOGame") ||
                !device.includes("Godot"))
        ) {
            ws.close(1, "Unauthorized");
            this.state = GameClientConnectionState.CLOSED;
        }

        logger.debug(`New connection established: ${this.connectionId}`);

        this.send(ws, {
            id: "acknowledge",
            data: {
                connectionId: this.connectionId,
            },
        });

        this.state = GameClientConnectionState.LOGIN;

        const sendNoAuthWarning = () =>
            this.send(ws, {
                id: "warning",
                data: {
                    message: "Missing access token. Please authenticate.",
                    code: WarningCode.MISSING_ACCESS_TOKEN,
                    fatal: false,
                },
            });

        if (this.headers.has("authorization")) {
            const authHeader = this.headers.get("authorization")!;
            const accessToken = authHeader.startsWith("Bearer ")
                ? authHeader.slice(7)
                : authHeader;

            if (!accessToken) {
                sendNoAuthWarning();
            } else {
                // Handle authentication immediately if access token is provided
                const clientDeclarationHandler = handlers["client_declaration"];
                if (clientDeclarationHandler) {
                    await clientDeclarationHandler.handler(
                        { id: "client_declaration", data: { accessToken } },
                        this,
                        ws,
                    );
                }
            }
        } else {
            sendNoAuthWarning();
        }

        if (this.state === GameClientConnectionState.LOGIN) {
            this._authTimeout = setTimeout(() => {
                if (this.state === GameClientConnectionState.LOGIN) {
                    logger.debug(
                        `Authentication timeout for connection ${this.connectionId}. Closing connection.`,
                    );

                    this.send(ws, {
                        id: "error",
                        data: {
                            message:
                                "Authentication timeout. Please reconnect.",
                            code: ErrorCode.AUTHENTICATION_TIMEOUT,
                            fatal: true,
                        },
                    });

                    ws.close(1008, "Authentication timeout");
                    this.state = GameClientConnectionState.CLOSED;
                    this._cleanup().catch(console.error);
                }
            }, AUTH_TIMEOUT);
        }
    }

    public async onMessage(e: MessageEvent<WSMessageReceive>, ws: WSContext) {
        logger.debug(
            `Message received on connection ${this.connectionId}: %s`,
            e.data,
        );

        if (typeof e.data !== "string") {
            this.send(ws, {
                id: "error",
                data: {
                    message: "Invalid message format. Expected JSON string.",
                    code: ErrorCode.INVALID_MESSAGE_FORMAT,
                    fatal: false,
                },
            });
        } else {
            const messageParseResult = await serverboundPacket.safeParseAsync(
                JSON.parse(e.data),
            );

            if (messageParseResult.error) {
                const errorMessage = messageParseResult.error.issues
                    .map(
                        (error) =>
                            error.message + " at " + error.path.join("."),
                    )
                    .join(", ");

                this.send(ws, {
                    id: "error",
                    data: {
                        message: errorMessage,
                        code: ErrorCode.INVALID_MESSAGE_FORMAT,
                        fatal: false,
                    },
                });
            } else {
                const message = messageParseResult.data;

                if (message.id in handlers) {
                    const handler = handlers[message.id]!;

                    try {
                        await handler.handler(message, this, ws);
                    } catch (error) {
                        logger.error(
                            error,
                            `Error handling message ${message.id} on connection ${this.connectionId}:`,
                        );
                        this.send(ws, {
                            id: "error",
                            data: {
                                message:
                                    "An error occurred while processing your request.",
                                code: ErrorCode.INTERNAL_ERROR,
                                fatal: false,
                            },
                        });
                    }
                }
            }
        }
    }

    public async onClose(e: CloseEvent, _ws: WSContext) {
        this.state = GameClientConnectionState.CLOSED;

        await this._cleanup(e.code === 1000 || e.code === 1001);

        logger.debug(`Connection closed: ${this.connectionId}`);
    }

    public send(
        ws: WSContext,
        message: Omit<ClientboundPacket, "sentAt"> & {
            sentAt?: ClientboundPacket["sentAt"];
        },
    ): void {
        ws.send(
            JSON.stringify({
                ...message,
                // sentAt: message.sentAt ?? Date.now(),
            }),
        );
    }

    public isInPlay(): this is this & {
        state: GameClientConnectionState.PLAY;
        session: UserSession;
        user: User;
    } {
        return (
            this.state === GameClientConnectionState.PLAY &&
            this.session !== null &&
            this.user !== null
        );
    }

    public setEnforcedState(
        ws: WSContext,
        name: EnforcedStateName,
        value: boolean,
    ): void {
        this.cachedEnforcedState[name] = value;

        this.send(ws, {
            id: "set_enforced_state",
            data: {
                name,
                value,
            },
        });
    }

    async ensureAuthInvalidationSubscription(
        ws: WSContext,
        userId?: number,
        sessionId?: number,
    ) {
        if (this._unsubscribeAuthInvalidation) return;

        const effectiveUserId = userId ?? this.user?.id;
        const effectiveSessionId = sessionId ?? this.session?.id;
        if (!effectiveUserId || !effectiveSessionId) return;

        this._unsubscribeAuthInvalidation = await onPubsubMessage(
            "user_auth_invalidated",
            effectiveUserId,
            (message) => {
                if (message.sessionId === effectiveSessionId) {
                    this.send(ws, {
                        id: "kick",
                        data: {
                            reason: KickReason.SESSION_INVALIDATED,
                        },
                    });
                    ws.close(4001, "Session invalidated");
                }
            },
        );
    }

    private async _cleanup(closeIntended = false) {
        // if (this._keepaliveInterval) {
        //     clearInterval(this._keepaliveInterval);
        //     this._keepaliveInterval = null;
        // }

        if (closeIntended) {
            // await Promise.all([
            //     redis.del(pubsubKey("client_connection", this.connectionId)),
            //     redis.del(
            //         pubsubKey("client_reconnection", this.reconnectionToken),
            //     ),
            // ]);
        }

        if (this._authTimeout) {
            clearTimeout(this._authTimeout);
            this._authTimeout = null;
        }

        if (this._unsubscribeAuthInvalidation) {
            try {
                await this._unsubscribeAuthInvalidation();
            } finally {
                this._unsubscribeAuthInvalidation = null;
            }
        }
    }
}
