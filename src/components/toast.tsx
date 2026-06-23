import { perHourDisplay, totalSizeVideoDisplay } from "@lib/formatting";
import "@styles/toast.css";

export default function Toast({
    currentQuality,
    sizePerSecondBytes,
    sizeBytes,
    isLive,
    okOnClick,
    dontShowAgainOnClick,
}: {
    currentQuality: number;
    sizePerSecondBytes: number;
    sizeBytes?: number;
    isLive: boolean;
    okOnClick: () => void;
    dontShowAgainOnClick: () => void;
}) {
    return (
        <div className="w-90 rounded-xl border border-white/10 bg-zinc-900/98 p-4 text-white">
            <div className="mb-3 text-sm font-extrabold tracking-wider text-red-400 uppercase">
                TubeSize | Warning: High Data Usage
            </div>
            <div className="mb-3.5 flex flex-col gap-3 text-sm leading-relaxed text-white/88">
                High Data Usage Detected for {currentQuality}p. It crosses the threshold specified
                in your settings.
                <div>
                    <span className="font-bold text-sky-400">
                        Current Quality: {currentQuality}p
                    </span>
                    <div className="mt-1.5 flex gap-2 text-xs">
                        {!isLive && sizeBytes && (
                            <span className="inline-flex flex-1 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/8 px-2 py-1.5 text-center font-semibold text-white/96">
                                Total Usage: {totalSizeVideoDisplay(sizeBytes)}
                            </span>
                        )}
                        <span className="inline-flex flex-1 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/8 px-2 py-1.5 text-center font-semibold text-white/96">
                            Per Hour Usage: {perHourDisplay(sizePerSecondBytes)}
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    className="inline-flex cursor-pointer rounded-lg border border-red-500/80 bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-px hover:border-red-400/90 hover:bg-red-500"
                    onClick={okOnClick}
                >
                    OK
                </button>
                <button
                    className="inline-flex cursor-pointer rounded-lg border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-px hover:border-white/25 hover:bg-white/15"
                    onClick={dontShowAgainOnClick}
                >
                    {"Don't show again for this session"}
                </button>
            </div>
        </div>
    );
}
