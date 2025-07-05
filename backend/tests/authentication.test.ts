import { WebsocketTester } from "./utils/WebsocketTester.ts";
import { getTestableUsername } from "./utils/testableData.ts";
import { beforeAll, describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import z from "zod";

import { db } from "@/db";
import { ErrorCode } from "@/enums/ErrorCode.ts";
import { app, v1UserAuth202Response } from "@/index.ts";
import {
    type PubsubMessages,
    onPubsubMessage,
    pubsubChannel,
    subscriberRedis,
} from "@/lib/pubsub.ts";
import { GameClientConnection } from "@/protocol/GameClientConnection.ts";

describe("HTTP Authentication", () => {
    test("User can register", async () => {
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

    test("User can authenticate", async () => {
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

    test("Socket terminates if client does not authenticate", async () => {
        const conn = new WebsocketTester(new GameClientConnection(nanoid()));
        await conn.open();

        // Wait for the connection to close
        await new Promise<void>((resolve) => {
            conn.on("closed", () => resolve());
        });

        const errorPacket = conn.outboundPackets.find(
            (packet) => packet.id === "error",
        );

        expect(errorPacket).toBeDefined();
        expect(errorPacket?.data.code).toEqual(
            ErrorCode.AUTHENTICATION_TIMEOUT,
        );
        expect(errorPacket?.data.fatal).toBeTruthy();
    });

    test("Rest sign in request works", async () => {
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

    test("All other sessions are invalidated on rest sign in", async () => {
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
});
