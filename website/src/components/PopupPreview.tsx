import { useState } from "react";

import type { Copy } from "../i18n";

interface FormatOption {
    res: string;
    size: string;
    rate: string;
}

const FORMATS: readonly FormatOption[] = [
    { res: "1080p", size: "685 MB", rate: "16.2 MB/min" },
    { res: "720p", size: "340 MB", rate: "8.0 MB/min" },
    { res: "480p", size: "165 MB", rate: "3.9 MB/min" },
    { res: "360p", size: "92 MB", rate: "2.2 MB/min" },
];

export function PopupPreview({ copy }: { copy: Copy }) {
    const [selectedRes, setSelectedRes] = useState("1080p");
    const todayDate = new Date().getDate();

    return (
        <div
            className="overflow-hidden rounded-xl border border-[#d8e0ea] bg-white text-[#14181f] shadow-[0_12px_28px_-14px_rgba(20,24,31,0.16)]"
            aria-label="Interactive TubeSize extension popup preview"
        >
            {/* Header */}
            <div className="border-b border-[#e6ebf2] bg-[#fbfcfd] px-2.5 pt-2 pb-2.5">
                <div className="flex items-center justify-between gap-2 px-0.5 pt-1 pb-2">
                    <div className="truncate text-[13px] font-bold text-[#14181f]">
                        Building a Home NAS from Scratch
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-500 tabular-nums">
                        42:18
                    </span>
                </div>
                <div className="flex gap-2">
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-[#dde4ee] bg-slate-100 px-2 py-1.5 text-[11.5px] font-semibold text-slate-800">
                        {copy.popupSettings}
                    </div>
                    <div className="flex flex-2 items-center justify-center rounded-lg border border-[#dde4ee] bg-slate-100 px-2 py-1.5 text-[11.5px] font-semibold text-slate-800">
                        {copy.popupDashboard}
                    </div>
                </div>
            </div>

            {/* Today's Usage & Site Usage — above resolutions */}
            <div className="flex flex-col gap-1.5 border-b border-[#edf1f6] px-2.5 pt-2.5 pb-2">
                <div className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 transition-colors hover:border-teal-600 hover:bg-slate-100">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md border-[1.5px] border-slate-600 bg-white text-[10px] font-bold text-[#14181f] tabular-nums">
                        {todayDate}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="text-[11px] font-medium text-slate-500">
                            {copy.popupTodayUsage}
                        </span>
                        <span className="text-[12.5px] font-bold text-[#14181f] tabular-nums">
                            1.24
                            <span className="ms-1 text-[10px] font-semibold text-slate-500">
                                GB
                            </span>
                        </span>
                    </div>
                    <span
                        className="text-sm text-slate-400 transition-colors group-hover:text-teal-700"
                        aria-hidden="true"
                    >
                        ›
                    </span>
                </div>

                <div className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 transition-colors hover:border-teal-600 hover:bg-slate-100">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-red-600">
                        <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="#ffffff"
                            aria-hidden="true"
                        >
                            <polygon points="6,4 20,12 6,20" />
                        </svg>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="text-[11px] font-medium text-slate-500">youtube.com</span>
                        <span className="text-[12.5px] font-bold text-[#14181f] tabular-nums">
                            890
                            <span className="ms-1 text-[10px] font-semibold text-slate-500">
                                MB
                            </span>
                        </span>
                    </div>
                    <span
                        className="text-sm text-slate-400 transition-colors group-hover:text-teal-700"
                        aria-hidden="true"
                    >
                        ›
                    </span>
                </div>
            </div>

            {/* Quality Formats */}
            <div className="flex flex-col gap-1.5 px-2.5 pt-2 pb-2.5" dir="ltr">
                {FORMATS.map((fmt) => {
                    const isCurrent = fmt.res === selectedRes;
                    return (
                        <button
                            key={fmt.res}
                            type="button"
                            onClick={() => setSelectedRes(fmt.res)}
                            className={
                                isCurrent
                                    ? "flex w-full cursor-pointer items-center justify-between rounded-lg border border-[#b91c1c] bg-[#c81e1e] px-3 py-2 text-white transition-colors"
                                    : "flex w-full cursor-pointer items-center justify-between rounded-lg border border-[#d5e4e2] bg-slate-50 px-3 py-2 text-[#14181f] transition-colors hover:border-teal-600 hover:bg-slate-100"
                            }
                        >
                            <span className="flex items-center gap-2">
                                <span className="text-[13px] font-bold">{fmt.res}</span>
                                {isCurrent && (
                                    <span className="rounded-full bg-white/22 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                                        {copy.popupCurrent}
                                    </span>
                                )}
                            </span>
                            <span className="text-right tabular-nums">
                                <span className="block text-[12.5px] font-bold">{fmt.size}</span>
                                <span
                                    className={
                                        isCurrent
                                            ? "block text-[10px] text-red-100"
                                            : "block text-[10px] text-slate-500"
                                    }
                                >
                                    {fmt.rate}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
