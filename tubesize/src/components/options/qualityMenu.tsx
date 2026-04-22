import { getFromSyncCache, setToSyncCache } from "@/lib/cache";
import CONFIG from "@/lib/constants";
import { useEffect, useState } from "react";

export default function QualityMenu() {
    const [qualityMenuEnabled, setQualityMenuEnabled] = useState<boolean>(
        CONFIG.DEFAULT_QUALITY_MENU_ENABLED,
    );

    useEffect(() => {
        (async () => {
            try {
                const qualityMenu =
                    (await getFromSyncCache("qualityMenu")) ?? CONFIG.DEFAULT_QUALITY_MENU_ENABLED;
                if (typeof qualityMenu === "boolean") {
                    setQualityMenuEnabled(qualityMenu);
                }
            } catch (error) {
                console.error("Failed to load qualityMenu setting from sync cache.", error);
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
                    onChange={async (event) => {
                        const { checked } = event.target as HTMLInputElement;
                        setQualityMenuEnabled(checked);
                        await setToSyncCache({
                            qualityMenu: checked,
                        });
                    }}
                ></input>
            </div>
        </div>
    );
}
