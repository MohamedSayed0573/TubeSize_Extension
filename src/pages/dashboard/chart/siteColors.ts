const SITE_COLORS = [
    "#f87171",
    "#f472b6",
    "#fb923c",
    "#facc15",
    "#a3e635",
    "#34d399",
    "#22d3ee",
    "#60a5fa",
    "#a78bfa",
    "#e879f9",
] as const;

export function getSiteColor(rank: number): string {
    return SITE_COLORS[rank % SITE_COLORS.length]!;
}
