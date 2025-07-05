import packageJson from "../../../package.json";

import { db } from "@/db";
import { ErrorCode } from "@/enums/ErrorCode.ts";
import { featureFlags } from "@/environment.ts";
import { defineHandler } from "@/lib/defineHandler.ts";
import { GameClientConnectionState } from "@/protocol/GameClientConnectionState.ts";

export const clientDeclaration = defineHandler(
    "client_declaration",
    async (message, conn, ws) => {
        const session = await db.query.userSessions.findFirst({
            where: (userSessions, { eq }) =>
                eq(userSessions.accessToken, message.data.accessToken),
        });

        if (!session) {
            conn.send(ws, {
                id: "error",
                data: {
                    message: "Invalid access token.",
                    code: ErrorCode.INVALID_ACCESS_TOKEN,
                    fatal: false,
                },
            });
            return;
        }

        if (session.expiresAt < new Date()) {
            conn.send(ws, {
                id: "error",
                data: {
                    message: "Access token has expired.",
                    code: ErrorCode.SESSION_EXPIRED,
                    fatal: false,
                },
            });
            return;
        }

        const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, session.userId),
        });

        conn.user = user!;
        conn.session = session;

        conn.send(ws, {
            id: "welcome",
            data: {
                environment:
                    (process.env.NODE_ENV as "development" | "production") ||
                    "development",
                featureFlags,
                serverVersion: packageJson.version,
            },
        });

        conn.state = GameClientConnectionState.PLAY;
    },
);
