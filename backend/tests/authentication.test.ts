import { WebsocketTester } from "./utils/WebsocketTester.ts";
import { getTestableUsername } from "./utils/testableData.ts";
import { beforeAll, describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import z from "zod";

import { db } from "@/db";
import { ErrorCode, WarningCode } from "@/enums/ErrorCode.ts";
import { app } from "@/index.ts";
import { v1UserAuth202Response } from "@/endpoints/v1/user.ts";
import { type PubsubMessages, onPubsubMessage } from "@/lib/pubsub.ts";
import { GameClientConnection } from "@/protocol/GameClientConnection.ts";
import { KickReason } from "@/enums/KickReason.ts";

describe("HTTP Authentication", () => {
    test.concurrent("User can register", async () => {
        const username = getTestableUsername();

        const response = await app.request("/v1/user/register", {
            method: "POST",
            body: JSON.stringify({
                username,
                password: "testpassword",
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.name, username),
        });

        expect(response.status).toBe(201);
        expect(user).toBeDefined();
    });

    test.concurrent("User can authenticate", async () => {
        const username = getTestableUsername();

        await app.request("/v1/user/register", {
            method: "POST",
            body: JSON.stringify({
                username,
                password: "testpassword",
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        const response = await app.request("/v1/user/auth", {
            method: "POST",
            body: JSON.stringify({
                username,
                password: "testpassword",
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        expect(response.status).toBe(200);

        const data = (await response.json()) as z.infer<
            typeof v1UserAuth202Response
        >;
        expect(data.accessToken).toBeDefined();
        expect(data.refreshToken).toBeDefined();
    });
});

describe("WebSocket Authentication", () => {
    const username = getTestableUsername();
    const password = "testpassword";
    let userId: number;

    beforeAll(async () => {
        await app.request("/v1/user/register", {
            method: "POST",
            body: JSON.stringify({
                username,
                password,
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.name, username),
        });
        expect(user).toBeDefined();

        userId = user!.id;
    });

    test.concurrent("Socket terminates if client does not authenticate", async () => {
        const conn = new WebsocketTester(new GameClientConnection(nanoid()));
        await conn.open();

        await conn.waitForClose();

        // Expect acknowledge first
        expect(conn.outboundPackets[0]?.id).toBe("acknowledge");
        // Expect missing access token warning
        const warningPacket = conn.outboundPackets.find(
            (p) => p.id === "warning",
        );
        expect(warningPacket).toBeDefined();
        expect(warningPacket?.data.code).toEqual(
            WarningCode.MISSING_ACCESS_TOKEN,
        );

        const errorPacket = conn.outboundPackets.find(
            (packet) => packet.id === "error",
        );

        expect(errorPacket).toBeDefined();
        expect(errorPacket?.data.code).toEqual(
            ErrorCode.AUTHENTICATION_TIMEOUT,
        );
        expect(errorPacket?.data.fatal).toBeTruthy();
    });

    test.concurrent("Rest sign in request works", async () => {
        const authResponse = await app.request("/v1/user/auth", {
            method: "POST",
            body: JSON.stringify({
                username,
                password,
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        expect(authResponse.status).toBe(200);

        const data = (await authResponse.json()) as z.infer<
            typeof v1UserAuth202Response
        >;

        expect(data.accessToken).toBeDefined();
        expect(data.refreshToken).toBeDefined();
    });

    test.concurrent("All other sessions are invalidated on rest sign in", async () => {
        const authResponse = await app.request("/v1/user/auth", {
            method: "POST",
            body: JSON.stringify({
                username,
                password,
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        expect(authResponse.status).toBe(200);

        const data = (await authResponse.json()) as z.infer<
            typeof v1UserAuth202Response
        >;

        expect(data.accessToken).toBeDefined();
        expect(data.refreshToken).toBeDefined();

        const firstSession = await db.query.userSessions.findFirst({
            where: (userSessions, { eq }) => eq(userSessions.userId, userId),
        });

        const messages: PubsubMessages["user_auth_invalidated"][] = [];

        const closeListener = await onPubsubMessage(
            "user_auth_invalidated",
            userId,
            (message) => {
                messages.push(message);
            },
        );

        const secondAuthResponse = await app.request("/v1/user/auth", {
            method: "POST",
            body: JSON.stringify({
                username,
                password,
            }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });

        expect(secondAuthResponse.status).toBe(200);

        const secondData = (await secondAuthResponse.json()) as z.infer<
            typeof v1UserAuth202Response
        >;

        expect(secondData.accessToken).toBeDefined();
        expect(secondData.refreshToken).toBeDefined();

        const sessions = await db.query.userSessions.findMany({
            where: (userSessions, { eq }) => eq(userSessions.userId, userId),
        });

        expect(sessions.length).toBe(1);

        const session = sessions[0]!;
        expect(session.accessToken).toEqual(secondData.accessToken);
        expect(session.refreshToken).toEqual(secondData.refreshToken);

        expect(messages.length).toBeGreaterThan(0);
        expect(messages[0]!.sessionId).toEqual(firstSession!.id);

        await closeListener();
    });

    test.concurrent("Active websocket is kicked when session is invalidated", async () => {
        // Use a unique user to avoid interference with concurrent tests
        const localUser = getTestableUsername();
        const localPass = "testpassword";

        const reg = await app.request("/v1/user/register", {
            method: "POST",
            body: JSON.stringify({ username: localUser, password: localPass }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect([201, 409]).toContain(reg.status);

        const auth1 = await app.request("/v1/user/auth", {
            method: "POST",
            body: JSON.stringify({ username: localUser, password: localPass }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect(auth1.status).toBe(200);
        const t1 = (await auth1.json()) as z.infer<typeof v1UserAuth202Response>;

        // Open WS with the first token
        const headers = new Headers({ Authorization: `Bearer ${t1.accessToken}` });
        const wsConn = new WebsocketTester(new GameClientConnection(nanoid(), headers));
        await wsConn.open();

        // Should have acknowledge and welcome
        expect(wsConn.outboundPackets.find((p) => p.id === "acknowledge")).toBeDefined();
        expect(wsConn.outboundPackets.find((p) => p.id === "welcome")).toBeDefined();

        let closedCode: number | undefined;
        wsConn.on("closed", (code) => {
            closedCode = code;
        });

        // Trigger second auth which invalidates the first session
        const auth2 = await app.request("/v1/user/auth", {
            method: "POST",
            body: JSON.stringify({ username: localUser, password: localPass }),
            headers: new Headers({ "Content-Type": "application/json" }),
        });
        expect(auth2.status).toBe(200);

        // Wait for the server to kick and close the connection
        await wsConn.waitForClose();

        const kick = wsConn.outboundPackets.find((p) => p.id === "kick");
        expect(kick).toBeDefined();

        expect(kick!.data.reason).toBe(KickReason.SESSION_INVALIDATED);
        expect(closedCode).toBe(4001);
    });
});
