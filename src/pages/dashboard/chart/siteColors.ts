// Stable, high-contrast colors for per-site bars and tooltip rows (matches dark UI).
// The first three are the day-chart tooltip colors, so ranks keep the same colors there.
const SITE_COLORS = [
    "#f87171", // red
    "#f472b6", // pink
    "#fb923c", // orange
    "#facc15", // yellow
    "#a3e635", // lime
    "#34d399", // emerald
    "#22d3ee", // cyan
    "#60a5fa", // blue
    "#a78bfa", // violet
    "#e879f9", // fuchsia
] as const;

// One color per site by usage rank; cycles if there are more sites than colors
export function getSiteColor(rank: number): string {
    return SITE_COLORS[rank % SITE_COLORS.length]!;
}
