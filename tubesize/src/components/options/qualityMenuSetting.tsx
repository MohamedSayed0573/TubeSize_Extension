import { useEffect, useState } from "react";
import { getFromSyncCache, setToSyncCache } from "@lib/cache";

export default function QualityMenuSetting() {
    const [showQualitySizesInPlayerMenu, setShowQualitySizesInPlayerMenu] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const value = await getFromSyncCache("showQualitySizesInPlayerMenu");
                setShowQualitySizesInPlayerMenu(value !== false);
            } catch (err) {
                console.error("Failed to load player quality menu setting from sync storage:", err);
                setShowQualitySizesInPlayerMenu(true);
            }
        })();
    }, []);

    return (
        <div className="container">
            <div className="section-title">YouTube Player Menu</div>
            <div className="api-fallback-row">
                <label className="api-fallback-toggle">
                    <input
                        type="checkbox"
                        checked={showQualitySizesInPlayerMenu}
                        onChange={async (event) => {
                            const isChecked = event.target.checked;
                            await setToSyncCache({
                                showQualitySizesInPlayerMenu: isChecked,
                            });
                            setShowQualitySizesInPlayerMenu(isChecked);
                        }}
                    />
                    <span className="api-fallback-label">Show sizes in quality settings</span>
                </label>
            </div>
        </div>
    );
}
