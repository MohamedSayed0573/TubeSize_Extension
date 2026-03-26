import { getFromSyncCache, setToSyncCache } from "@/cache";
import { useEffect, useState } from "react";

export default function PanelSettings() {
    const [showPanel, setShowPanel] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const options = await getFromSyncCache();
                if (options?.showPanel === false) setShowPanel(false);
            } catch (err) {
                console.error("Failed to load show panel setting from sync storage:", err);
                // Keep the default (true = show panel) on error; do not hide it
            }
        })();
    }, []);
    return (
        <div className="panel-settings">
            <div className="container">
                <div className="section-title">Panel</div>
                <div className="api-fallback-row">
                    <label className="api-fallback-toggle">
                        <input
                            type="checkbox"
                            checked={showPanel}
                            onChange={async (event) => {
                                const isChecked = event.target.checked;
                                await setToSyncCache({
                                    showPanel: isChecked,
                                });
                                setShowPanel(isChecked);
                            }}
                        />
                        <span className="api-fallback-label">
                            Show sizes inline on YouTube video pages
                        </span>
                    </label>
                </div>
            </div>
        </div>
    );
}
