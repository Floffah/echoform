import { nanoid } from "nanoid";

export function getTestableUsername() {
    return "test:" + nanoid(10);
}
