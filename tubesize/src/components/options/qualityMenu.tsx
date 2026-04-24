import { getFromSyncCache, setToSyncCache } from "@/lib/cache";
import CONFIG from "@/lib/constants";
import { useEffect, useState } from "react";

export default function QualityMenu() {
    const [qualityMenuEnabled, setQualityMenuEnabled] = useState<boolean>(
        CONFIG.DEFAULT_QUALITY_MENU_ENABLED,
    );

    useEffect(() => {
        (() => {
            const qualityMenu =
                getFromSyncCache("qualityMenu") ?? CONFIG.DEFAULT_QUALITY_MENU_ENABLED;
            if (typeof qualityMenu === "boolean") {
                setQualityMenuEnabled(qualityMenu);
            }
        })();
    }, []);

    return (
        <div className="container">
            <div className="section-title">Quality Menu</div>
            <div className="setting-toggle-row">
                <label className="option-label" htmlFor="qualityMenuToggle">
                    Enable Quality Menu
                </label>
                <input
                    id="qualityMenuToggle"
                    type="checkbox"
                    checked={qualityMenuEnabled}
                    onChange={(event) => {
                        const { checked } = event.target;
                        void setToSyncCache({
                            qualityMenu: checked,
                        }).then(() => setQualityMenuEnabled(checked));
                    }}
                ></input>
            </div>
        </div>
    );
}
