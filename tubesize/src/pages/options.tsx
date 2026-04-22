import "@styles/options.css";
import "@styles/global.css";
import CONFIG from "@lib/constants";
import HeaderOptions from "@components/options/headerOptions";
import OptionItem from "@components/options/optionItem";
import CacheSettings from "@components/options/cacheSettings";
import { useState, useEffect } from "react";
import { getAllFromSyncCache } from "@lib/cache";
import ToasterSettings from "@components/options/toasterSettings";
import QualityMenu from "@components/options/qualityMenu";

export default function Options() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [optionsState, setOptionsState] = useState<Record<any, any>>({});

    useEffect(() => {
        try {
            (async () => {
                const options = await getAllFromSyncCache();
                setOptionsState(options);
            })();
        } catch (err) {
            console.error("Failed to load options from cache:", err);
        }
    }, []);

    return (
        <div className="options-page">
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
            <ToasterSettings />

            <div className="section-divider"></div>
            <QualityMenu />

            <div className="section-divider"></div>
            <div className="footer">
                <div className="author">
                    <a href="https://github.com/MohamedSayed0573" target="_blank">
                        <img src="icons/github.svg" alt="" width="14" height="14" />
                        @Mohamed Sayed
                    </a>
                </div>
                <div>
                    <a href="https://ko-fi.com/mohamedsayed253" target="_blank">
                        <img src="icons/support.svg" alt="" width="14" height="14" />
                        Support Me
                    </a>
                </div>
            </div>
        </div>
    );
}
