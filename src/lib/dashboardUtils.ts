export function getUsageNumber(usage: Record<string, number> | undefined) {
    if (!usage) return 0;

    let total = 0;
    for (const bytes of Object.values(usage)) {
        total += bytes;
    }

    return total;
}
