import { useState } from "react";
import { setToSyncCache, clearLocalCache } from "@lib/cache";
import useOptions from "@hooks/useOptions";
import CONFIG from "@lib/constants";

function convertDaysToSeconds(days: number | string) {
    return Number(days) * 24 * 60 * 60;
}

function convertSecondsToDays(seconds: number | string) {
    return String(Math.round(Number(seconds) / (24 * 60 * 60)));
}

const stateStyles = {
    idle: "border-red-500/20 bg-red-500/8 text-red-400 hover:border-red-500/40 hover:bg-red-500/18",
    success: "border-green-500/40 bg-green-500/8 text-green-500",
    fail: "border-red-500/20 bg-red-500/8 text-red-400",
} as const;

export default function CacheSettings() {
    const [clearCache, setClearCache] = useState<"idle" | "success" | "fail">("idle");
    const [disableClearCache, setDisableClearCache] = useState(false);
    const { optionsState, setOptionsState } = useOptions();

    return (
        <div className="p-3">
            <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Cache
            </div>
            <div className="mb-2 flex items-center justify-between rounded-md border border-transparent bg-white/4 p-3">
                <span className="text-xs font-medium">Duration</span>
                <select
                    id="cacheTTL"
                    className="cursor-pointer rounded border border-white/15 bg-zinc-800 p-1 outline-none focus:border-sky-400"
                    value={
                        convertSecondsToDays(optionsState.cacheTTL ?? CONFIG.DEFAULT_CACHE_TTL) ||
                        "3"
                    } // Fallback to "3" days if undefined
                    onChange={(event) => {
                        const days = event.target.value;
                        const ttlInSeconds = convertDaysToSeconds(days);
                        setToSyncCache({
                            cacheTTL: ttlInSeconds,
                        }).catch(() => {});
                        setOptionsState((prev) => ({
                            ...prev,
                            cacheTTL: ttlInSeconds,
                        }));
                    }}
                >
                    <option value="1">1 Day</option>
                    <option value="3">3 Days</option>
                    <option value="7">7 Days</option>
                </select>
            </div>
            <button
                id="resetCache"
                className={`w-full cursor-pointer rounded-md border px-2.5 py-2 text-center text-xs font-medium transition-all disabled:cursor-default ${stateStyles[clearCache]}`}
                disabled={disableClearCache}
                onClick={() => {
                    setDisableClearCache(true);
                    clearLocalCache()
                        .then(() => {
                            setClearCache("success");
                            setTimeout(() => {
                                setClearCache("idle");
                                setDisableClearCache(false);
                            }, 2000);
                            return;
                        })
                        .catch(() => {
                            setClearCache("fail");
                            setDisableClearCache(false);
                        });
                }}
            >
                {clearCache === "idle" && "Clear Cache"}
                {clearCache === "success" && "Cache Cleared Successfully"}
                {clearCache === "fail" && "Failed to Clear Cache"}
            </button>
        </div>
    );
}
