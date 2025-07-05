import z from "zod";

export const zodNanoid = z.string().regex(/^[\w-]+$/, "Invalid nanoid format");
