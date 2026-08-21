import { filesize } from "filesize";

/**
 * @example perHourDisplay(1_000_000) => "3600.00 MB/hour"
 */
export function perHourDisplay(sizePerSecondBytes: number): string {
    const sizePerHourMB = sizePerHour(sizePerSecondBytes);
    if (sizePerHourMB >= 1000) {
        return `${(sizePerHourMB / 1000).toFixed(2)} GB/hour`;
    }
    return `${sizePerHourMB.toFixed(2)} MB/hour`;
}

/**
 * @example totalSizeVideoDisplay(1_000_000) => "1.00 MB"
 */
export function totalSizeVideoDisplay(totalSizeBytes: number): string {
    return filesize(totalSizeBytes, { base: 10, standard: "jedec", round: 2 });
}

/**
 * @example perMinuteDisplay(1_000_000) => "60.0 MB/min"
 */
export function perMinuteDisplay(sizePerSecondBytes: number): string {
    const sizePerMinuteMB = sizePerMinute(sizePerSecondBytes);
    return `${sizePerMinuteMB.toFixed(1)} MB/min`;
}

/**
 * @example sizePerMinute(1_000_000) => 60.0
 */
export function sizePerMinute(sizePerSecondBytes: number): number {
    return (sizePerSecondBytes * 60) / 1_000_000;
}

/**
 * @example sizePerHour(1_000_000) => 3600.0
 */
function sizePerHour(sizePerSecondBytes: number): number {
    return sizePerMinute(sizePerSecondBytes) * 60;
}
