import { useState, useEffect } from "react";
import { setToSyncCache, getFromSyncCache, clearLocalCache } from "@lib/cache";

function convertDaysToSeconds(days: number | string) {
    return Number(days) * 24 * 60 * 60;
}

function convertSecondsToDays(seconds: number | string) {
    return String(Math.round(Number(seconds) / (24 * 60 * 60)));
}

export default function CacheSettings() {
    const [cacheState, setCacheState] = useState<string>("3");
    const [clearCache, setClearCache] = useState<"idle" | "success" | "fail">("idle");
    const [disableClearCache, setDisableClearCache] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const options = await getFromSyncCache();
                if (options?.cacheTTL) {
                    setCacheState(convertSecondsToDays(options.cacheTTL as string));
                }
            } catch (err) {
                console.error("Failed to load cache setting from cache:", err);
            }
        })();
    }, []);

    return (
        <div className="container">
            <div className="section-title">Cache</div>
            <div className="cache-row">
                <span className="cache-row-label">Duration</span>
                <select
                    id="cacheTTL"
                    className="ttl-select"
                    value={cacheState || "3"} // Fallback to "3" days if undefined
                    onChange={async (event) => {
                        const days = event.target.value;
                        const daysInSeconds = convertDaysToSeconds(days);
                        await setToSyncCache({
                            cacheTTL: daysInSeconds,
                        });
                        setCacheState(days);
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
                    } catch (err) {
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
