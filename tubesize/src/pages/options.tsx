import "@styles/options.css";
import CONFIG from "@lib/constants";
import HeaderOptions from "@components/options/headerOptions";
import OptionItem from "@components/options/optionItem";
import CacheSettings from "@components/options/cacheSettings";
import { useState, useEffect } from "react";
import { getFromSyncCache } from "@lib/cache";

export default function Options() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [optionsState, setOptionsState] = useState<Record<any, any>>({});

    useEffect(() => {
        try {
            (async () => {
                const options = await getFromSyncCache();
                setOptionsState(options);
            })();
        } catch (err) {
            console.error("Failed to load options from cache:", err);
        }
    }, []);

    return (
        <>
            <HeaderOptions />
            <div className="container">
                <div className="description">Select which resolutions to display:</div>
                <div id="options-grid">
                    {CONFIG.optionIDs.map((option) => {
                        return (
                            <OptionItem
                                key={option}
                                option={option}
                                optionsState={optionsState}
                                setOptionsState={setOptionsState}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="section-divider"></div>
            <CacheSettings />

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
