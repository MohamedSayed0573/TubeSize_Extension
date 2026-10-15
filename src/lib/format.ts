import { filesize, type FilesizeOptions } from "filesize";

/**
 * Formats bytes as a human-readable string.
 * @example formatBytes(1000) returns "1 KB"
 */
export function formatBytes(bytes: number, options?: FilesizeOptions) {
    const [value, unit] = filesize(bytes, {
        base: 10,
        standard: "si",
        round: 2,
        ...options,
    }).split(" ");

    return `${value} ${unit!.toUpperCase()}`;
}
