import pino from "pino";
import { PinoPretty } from "pino-pretty";

export const logger = pino(
    {
        level: process.env["LOG_LEVEL"] || "debug",
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    process.env.NODE_ENV !== "production"
        ? PinoPretty({ colorize: true })
        : undefined,
);

if (process.env.NODE_ENV !== "test") {
    console.log = logger.info.bind(logger);
    console.error = logger.error.bind(logger);
    console.warn = logger.warn.bind(logger);
    console.info = logger.info.bind(logger);
    console.debug = logger.debug.bind(logger);
    console.trace = logger.trace.bind(logger);
} else {
    logger.level = "info";
}
