import { EnforcedStateName } from "@/enums/EnforcedStateName.ts";
import { SceneName } from "@/enums/SceneName.ts";
import { defineHandler } from "@/lib/defineHandler.ts";

export const clientReady = defineHandler(
    "client_ready",
    async (_message, conn, ws) => {
        if (!conn.isInPlay()) {
            return;
        }

        conn.clientReady = true;

        if (!conn.user.onboarded) {
            conn.setEnforcedState(ws, EnforcedStateName.CAN_HOME, false);

            conn.send(ws, {
                id: "force_scene",
                data: {
                    scene: SceneName.INTRO,
                },
            });
        }
    },
);
