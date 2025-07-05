import { nanoid } from "nanoid";

export function generatePublicId() {
    // why is this even an error
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return nanoid() as string;
}
