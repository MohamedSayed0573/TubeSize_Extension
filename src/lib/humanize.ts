import prettyMilliseconds from "pretty-ms";

const AR_UNITS: Record<string, string> = {
    y: "س",
    d: "ي",
    h: "س",
    m: "د",
    s: "ث",
    ms: "مث",
};

// pretty-ms always emits space-separated "<count><unit>" parts like "2h 1m",
function toArabicUnits(formatted: string): string {
    return formatted
        .split(" ")
        .map((part) => {
            const unit = part.endsWith("ms") ? "ms" : part.slice(-1);
            const count = part.slice(0, -unit.length);
            return `${count}${AR_UNITS[unit] ?? unit}`;
        })
        .join(" ");
}

export function humanizeDuration(ms: number, language: string): string {
    const remaining = Math.abs(ms);
    if (remaining === 0) {
        return language.startsWith("ar") ? `0 ${AR_UNITS.s}` : "0s";
    }

    const english = prettyMilliseconds(remaining, {
        unitCount: 2,
        secondsDecimalDigits: 0,
    });

    if (!language.startsWith("ar")) {
        return english;
    }
    return toArabicUnits(english);
}
