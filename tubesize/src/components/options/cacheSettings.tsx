import { useState } from "react";
import { setToSyncCache, clearLocalCache } from "@lib/cache";
import useOptions from "@/hooks/useOptions";
import CONFIG from "@/lib/constants";

function convertDaysToSeconds(days: number | string) {
    return Number(days) * 24 * 60 * 60;
}

function convertSecondsToDays(seconds: number | string) {
    return String(Math.round(Number(seconds) / (24 * 60 * 60)));
}

export default function CacheSettings() {
    const [clearCache, setClearCache] = useState<"idle" | "success" | "fail">("idle");
    const [disableClearCache, setDisableClearCache] = useState(false);
    const { optionsState, setOptionsState } = useOptions();

    return (
        <div className="container">
            <div className="section-title">Cache</div>
            <div className="cache-row">
                <span className="cache-row-label">Duration</span>
                <select
                    id="cacheTTL"
                    className="ttl-select"
                    value={
                        convertSecondsToDays(optionsState?.cacheTTL ?? CONFIG.DEFAULT_CACHE_TTL) ||
                        "3"
                    } // Fallback to "3" days if undefined
                    onChange={async (event) => {
                        const days = event.target.value;
                        const ttlInSeconds = convertDaysToSeconds(days);
                        await setToSyncCache({
                            cacheTTL: ttlInSeconds,
                        });
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
                className={`reset-cache-btn ${clearCache}`}
                disabled={disableClearCache}
                onClick={async () => {
                    setDisableClearCache(true);
                    try {
                        await clearLocalCache();
                        setClearCache("success");
                        setTimeout(() => {
                            setClearCache("idle");
                            setDisableClearCache(false);
                        }, 2000);
                    } catch {
                        setClearCache("fail");
                        setDisableClearCache(false);
                    }
                }}
            >
                {clearCache === "idle" && "Clear Cache"}
                {clearCache === "success" && "Cache Cleared Successfully"}
                {clearCache === "fail" && "Failed to Clear Cache"}
            </button>
        </div>
    );
}
