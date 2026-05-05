export function perHourDisplay(sizePerSecondBytes: number): string {
    const sizePerHourMB = sizePerHour(sizePerSecondBytes);
    if (sizePerHourMB >= 1000) {
        return `${(sizePerHourMB / 1000).toFixed(2)} GB/hour`;
    }
    return `${sizePerHourMB.toFixed(2)} MB/hour`;
}

export function totalSizeLiveDisplay(sizePerSecondBytes: number, durationSeconds?: number): string {
    if (!durationSeconds) return "";
    const sizePerMinuteMB = sizePerMinute(sizePerSecondBytes);
    const totalSizeMB = (sizePerMinuteMB / 60) * durationSeconds;
    if (totalSizeMB >= 1000) {
        return `${(totalSizeMB / 1000).toFixed(2)} GB`;
    }
    return `${totalSizeMB.toFixed(2)} MB`;
}
export function totalSizeVideoDisplay(totalSizeBytes: number): string {
    const totalSizeMB = totalSizeBytes / 1_000_000;
    if (totalSizeMB >= 1000) {
        return `${(totalSizeMB / 1000).toFixed(2)} GB`;
    }
    return `${totalSizeMB.toFixed(2)} MB`;
}

export function perMinuteDisplay(sizePerSecondBytes: number): string {
    const sizePerMinuteMB = sizePerMinute(sizePerSecondBytes);
    return `${sizePerMinuteMB.toFixed(1)} MB/min`;
}

export function sizePerMinute(sizePerSecondBytes: number): number {
    return (sizePerSecondBytes * 60) / 1_000_000;
}

function sizePerHour(sizePerSecondBytes: number): number {
    return sizePerMinute(sizePerSecondBytes) * 60;
}
