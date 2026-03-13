import "./styles/options.css";
import CONFIG from "./constants";
import { useEffect, useState } from "react";

async function getAllOptions() {
    const allOptions = await chrome.storage.sync.get();
    return allOptions;
}

function Options() {
    const [optionsState, setOptionsState] = useState<{ [key: string]: boolean }>();
    const [cacheState, setCacheState] = useState<string>();
    const [apiFallback, setAPIFallback] = useState(false);

    useEffect(() => {
        (async () => {
            const options = await getAllOptions();
            setOptionsState(options as any);

            setCacheState(options.cacheTTL as string);
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
                                {option}
                                <input
                                    type="checkbox"
                                    checked={optionsState?.[option] ?? true}
                                    onChange={async (event) => {
                                        const isChecked = event.target.checked;
                                        await chrome.storage.sync.set({
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
                            const isChecked = event.target.value;
                            await chrome.storage.sync.set({
                                cacheTTL: isChecked,
                            });
                            setCacheState(isChecked);
                        }}
                    >
                        <option value="1">1 Day</option>
                        <option value="3">3 Days</option>
                        <option value="7">7 Days</option>
                    </select>
                </div>
                <button
                    id="resetCache"
                    className="reset-cache-btn"
                    onChange={async () => await chrome.storage.local.clear()}
                >
                    Clear Cache
                </button>
            </div>
            <div className="section-divider"></div>
            <div className="container">
                <div className="section-title">API Fallback</div>
                <div className="api-fallback-row">
                    <label className="api-fallback-toggle" htmlFor="apiFallback">
                        <input type="checkbox" id="apiFallback" />
                        <span className="api-fallback-label">Use backup server</span>
                    </label>
                    <div className="info-tooltip">
                        <button
                            type="button"
                            className="info-tooltip-trigger"
                            aria-label="More information about API fallback"
                            onClick={async () => {
                                const isChecked = !apiFallback;
                                await chrome.storage.sync.set({
                                    apiFallback: isChecked,
                                });
                                setAPIFallback(isChecked);
                            }}
                        ></button>
                        <div className="i  nfo-tooltip-content" role="tooltip">
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
