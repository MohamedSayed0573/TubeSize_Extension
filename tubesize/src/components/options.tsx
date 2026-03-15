import "../styles/options.css";
import CONFIG from "../constants";
import { useEffect, useState } from "react";
import { clearLocalStorage, getFromSyncCache, setToSyncCache } from "../cache";

async function getAllOptions() {
    const allOptions = await getFromSyncCache();
    return allOptions;
}

function convertDaysToSeconds(days: number | string) {
    return Number(days) * 24 * 60 * 60;
}

function Options() {
    const [optionsState, setOptionsState] = useState<{ [key: string]: boolean }>();
    const [cacheState, setCacheState] = useState<string>();
    const [apiFallback, setAPIFallback] = useState(false);
    const [clearCache, setClearCache] = useState("idle");
    const [disableClearCache, setDisableClearCache] = useState(false);

    useEffect(() => {
        (async () => {
            const options = await getAllOptions();
            setOptionsState(options as any);

            setCacheState(options.cacheTTL as string);
            setAPIFallback(!!options.apiFallback);
        })();
    }, []);

    return (
        <>
            <div className="header">
                <a id="backBtn" href="index.html">
                    &larr; Back
                </a>
                <h3>Options</h3>
            </div>
            <div className="container">
                <div className="description">Select which resolutions to display:</div>
                <div id="options-grid">
                    {CONFIG.optionIDs.map((option) => {
                        return (
                            <div className="option-item" key={option}>
                                <label className="option-label" htmlFor={option}>
                                    {option.substring(1) + "p"}
                                </label>
                                <input
                                    id={option}
                                    type="checkbox"
                                    checked={optionsState?.[option] ?? true}
                                    onChange={async (event) => {
                                        const isChecked = event.target.checked;
                                        await setToSyncCache({
                                            [option]: isChecked,
                                        });
                                        setOptionsState({ ...optionsState, [option]: isChecked });
                                    }}
                                ></input>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="section-divider"></div>
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
                        const success = await clearLocalStorage();

                        if (success) {
                            setClearCache("success");
                            setTimeout(() => {
                                setClearCache("idle");
                                setDisableClearCache(false);
                            }, 2000);
                        } else {
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
            <div className="section-divider"></div>
            <div className="container">
                <div className="section-title">API Fallback</div>
                <div className="api-fallback-row">
                    <label className="api-fallback-toggle">
                        <input
                            type="checkbox"
                            checked={apiFallback}
                            onChange={async (event) => {
                                const isChecked = event.target.checked;
                                await setToSyncCache({
                                    apiFallback: isChecked,
                                });
                                setAPIFallback(isChecked);
                            }}
                        />
                        <span className="api-fallback-label">Use backup server</span>
                    </label>
                    <div className="info-tooltip">
                        <button
                            type="button"
                            className="info-tooltip-trigger"
                            aria-label="More information about API fallback"
                        ></button>
                        <div className="info-tooltip-content" role="tooltip">
                            Uses our backup server when local extraction fails. It can be slower.
                            See
                            <a
                                href="https://github.com/MohamedSayed0573/TubeSize_Extension/blob/main/PRIVACY.md"
                                target="_blank"
                                style={{ color: "inherit", textDecoration: "underline" }}
                            >
                                our privacy policy
                            </a>
                            for more details.
                        </div>
                    </div>
                </div>
            </div>
            <div className="section-divider"></div>
            <div className="author">
                <a href="https://github.com/MohamedSayed0573" target="_blank">
                    <img src="icons/github.svg" alt="" width="14" height="14" />
                    @Mohamed Sayed
                </a>
            </div>
        </>
    );
}

export default Options;
