import { useState } from "react";

import type { Copy } from "../i18n";

interface DayEntry {
    label: string;
    full: string;
    pct: number;
    total: string;
    sites: readonly (readonly [string, string])[];
}

const DAYS: readonly DayEntry[] = [
    {
        label: "Nov 21",
        full: "Nov 21, 2026",
        pct: 46,
        total: "1.18 GB",
        sites: [
            ["youtube.com", "720 MB"],
            ["twitch.tv", "310 MB"],
            ["reddit.com", "150 MB"],
        ],
    },
    {
        label: "Nov 22",
        full: "Nov 22, 2026",
        pct: 64,
        total: "1.64 GB",
        sites: [
            ["youtube.com", "1.02 GB"],
            ["kick.com", "440 MB"],
            ["github.com", "180 MB"],
        ],
    },
    {
        label: "Nov 23",
        full: "Nov 23, 2026",
        pct: 38,
        total: "960 MB",
        sites: [
            ["youtube.com", "540 MB"],
            ["instagram.com", "260 MB"],
            ["x.com", "160 MB"],
        ],
    },
    {
        label: "Nov 24",
        full: "Nov 24, 2026",
        pct: 92,
        total: "2.38 GB",
        sites: [
            ["youtube.com", "1.45 GB"],
            ["twitch.tv", "680 MB"],
            ["kick.com", "250 MB"],
        ],
    },
    {
        label: "Nov 25",
        full: "Nov 25, 2026",
        pct: 54,
        total: "1.39 GB",
        sites: [
            ["youtube.com", "840 MB"],
            ["twitch.tv", "370 MB"],
            ["github.com", "180 MB"],
        ],
    },
    {
        label: "Nov 26",
        full: "Nov 26, 2026",
        pct: 74,
        total: "1.91 GB",
        sites: [
            ["youtube.com", "1.12 GB"],
            ["kick.com", "510 MB"],
            ["reddit.com", "280 MB"],
        ],
    },
    {
        label: "Nov 27",
        full: "Nov 27, 2026",
        pct: 50,
        total: "1.24 GB",
        sites: [
            ["youtube.com", "890 MB"],
            ["twitch.tv", "240 MB"],
            ["github.com", "110 MB"],
        ],
    },
];

const SITE_COLORS = ["#ef4444", "#ec4899", "#f97316", "#eab308", "#84cc16"] as const;

const SITES_DATA = [
    { name: "youtube.com", width: "100%", bytes: "18.4 GB", color: SITE_COLORS[0] },
    { name: "twitch.tv", width: "46%", bytes: "8.5 GB", color: SITE_COLORS[1] },
    { name: "kick.com", width: "24%", bytes: "4.4 GB", color: SITE_COLORS[2] },
    { name: "instagram.com", width: "13%", bytes: "2.3 GB", color: SITE_COLORS[3] },
    { name: "github.com", width: "7%", bytes: "1.2 GB", color: SITE_COLORS[4] },
] as const;

export function DashboardPreview({ copy }: { copy: Copy }) {
    const [chartMode, setChartMode] = useState<"daily" | "sites">("daily");
    const [selectedIdx, setSelectedIdx] = useState(3);
    const activeDay = DAYS[selectedIdx] ?? DAYS[3]!;

    const stats = [
        {
            label: copy.statToday,
            value: "1.24 GB",
            badgeClass: "bg-sky-100 text-sky-600",
            icon: (
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
            ),
        },
        {
            label: copy.statWeek,
            value: "8.62 GB",
            badgeClass: "bg-emerald-100 text-emerald-600",
            icon: (
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="8" y1="14" x2="16" y2="14" />
                </svg>
            ),
        },
        {
            label: copy.statMonth,
            value: "34.8 GB",
            badgeClass: "bg-violet-100 text-violet-600",
            icon: (
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                >
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
            ),
        },
        {
            label: copy.statLifetime,
            value: "112.4 GB",
            badgeClass: "bg-amber-100 text-amber-600",
            icon: (
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                >
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                    <path d="M3 12a9 3 0 0 0 18 0" />
                </svg>
            ),
        },
    ];

    return (
        <div className="rounded-xl border border-[#d8e0ea] bg-white p-4 shadow-[0_8px_24px_-16px_rgba(20,24,31,0.12)]">
            {/* 4-column StatsRow */}
            <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {stats.map((s) => (
                    <div
                        key={s.label}
                        className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold whitespace-nowrap text-teal-700 uppercase">
                            <span
                                className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md ${s.badgeClass}`}
                            >
                                {s.icon}
                            </span>
                            <span className="truncate">{s.label}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-1.5">
                            <span
                                className="font-mono text-base font-bold whitespace-nowrap text-[#14181f] sm:text-[17px]"
                                dir="ltr"
                            >
                                {s.value}
                            </span>
                            <span className="font-mono text-[10px] whitespace-nowrap text-teal-600 underline">
                                {copy.viewDetails}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* UsageChartSection */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex size-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                            <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                aria-hidden="true"
                            >
                                <ellipse cx="12" cy="5" rx="9" ry="3" />
                                <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                            </svg>
                        </span>
                        <h3 className="text-sm font-bold text-[#14181f]">
                            {chartMode === "daily" ? copy.chartDailyTitle : copy.chartSitesTitle}
                        </h3>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex rounded-md border border-[#dce4ee] bg-[#edf1f6] p-0.5">
                            <button
                                type="button"
                                onClick={() => setChartMode("daily")}
                                className={
                                    chartMode === "daily"
                                        ? "cursor-pointer rounded bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#14181f] shadow-xs"
                                        : "cursor-pointer rounded px-2.5 py-1 text-[11.5px] font-semibold text-slate-500 hover:text-[#14181f]"
                                }
                            >
                                {copy.byDay}
                            </button>
                            <button
                                type="button"
                                onClick={() => setChartMode("sites")}
                                className={
                                    chartMode === "sites"
                                        ? "cursor-pointer rounded bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#14181f] shadow-xs"
                                        : "cursor-pointer rounded px-2.5 py-1 text-[11.5px] font-semibold text-slate-500 hover:text-[#14181f]"
                                }
                            >
                                {copy.bySite}
                            </button>
                        </div>

                        <span className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-[11.5px] whitespace-nowrap text-teal-700">
                            <strong className="font-mono font-bold">14</strong>
                            <span>{copy.daysWord}</span>
                        </span>
                    </div>
                </div>

                {chartMode === "daily" ? (
                    <div
                        className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_220px]"
                        dir="ltr"
                    >
                        <div className="flex h-32 items-end gap-2 border-b border-slate-200 px-1 pt-2">
                            {DAYS.map((d, idx) => {
                                const isSelected = idx === selectedIdx;
                                return (
                                    <button
                                        key={d.label}
                                        type="button"
                                        onMouseEnter={() => setSelectedIdx(idx)}
                                        onClick={() => setSelectedIdx(idx)}
                                        className="group flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-1.5"
                                    >
                                        <span
                                            className={
                                                isSelected
                                                    ? "w-full rounded-t bg-[#14181f] transition-colors"
                                                    : "w-full rounded-t bg-slate-300 transition-colors group-hover:bg-[#14181f]"
                                            }
                                            style={{ height: `${d.pct}%` }}
                                        />
                                        <span className="pb-1 text-[10px] whitespace-nowrap text-slate-500">
                                            {d.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="rounded-xl border border-[#dce4ee] bg-white px-3 py-2.5 text-xs shadow-[0_8px_20px_-10px_rgba(20,24,31,0.15)]">
                            <div className="mb-1.5 font-bold text-[#14181f]">{activeDay.full}</div>
                            <div className="flex items-center justify-between gap-2 py-0.5">
                                <span className="flex items-center gap-1.5 text-slate-600">
                                    <span className="size-2.5 shrink-0 rounded-xs bg-[#14181f]" />
                                    {copy.allSites}
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-[#14181f]">
                                    {activeDay.total}
                                </span>
                            </div>
                            {activeDay.sites.map(([site, size], i) => (
                                <div
                                    key={site}
                                    className="flex items-center justify-between gap-2 py-0.5"
                                >
                                    <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                                        <span
                                            className="size-2.5 shrink-0 rounded-xs"
                                            style={{ backgroundColor: SITE_COLORS[i] }}
                                        />
                                        <span className="truncate">{site}</span>
                                    </span>
                                    <span className="font-mono text-[11px] font-semibold text-[#14181f]">
                                        {size}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5 py-1" dir="ltr">
                        {SITES_DATA.map((site) => (
                            <div
                                key={site.name}
                                className="grid grid-cols-[104px_1fr_60px] items-center gap-3 text-xs"
                            >
                                <span className="truncate text-right font-bold text-[#14181f]">
                                    {site.name}
                                </span>
                                <div className="flex h-5 items-center">
                                    <div
                                        className="h-full rounded-r-md"
                                        style={{ width: site.width, backgroundColor: site.color }}
                                    />
                                </div>
                                <span className="font-mono text-[11.5px] font-semibold text-slate-600">
                                    {site.bytes}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
