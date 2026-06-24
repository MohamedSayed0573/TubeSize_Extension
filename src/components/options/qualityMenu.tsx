import { getFromSyncCache, setToSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";
import { useEffect, useState } from "react";

export default function QualityMenu() {
    const [qualityMenuEnabled, setQualityMenuEnabled] = useState<boolean>(
        CONFIG.DEFAULT_QUALITY_MENU_ENABLED,
    );

    useEffect(() => {
        void (async () => {
            const isQualityMenuEnabled =
                (await getFromSyncCache("qualityMenu")) ?? CONFIG.DEFAULT_QUALITY_MENU_ENABLED;
            if (typeof isQualityMenuEnabled === "boolean") {
                setQualityMenuEnabled(isQualityMenuEnabled);
            }
        })();
    }, []);

    return (
        <div className="p-3.5">
            <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Quality Menu
            </div>
            <div className="flex items-center justify-between rounded-md border border-transparent bg-white/4 px-4 py-2 transition-all duration-300 hover:border-white/15 hover:bg-white/8">
                <label
                    className="cursor-pointer text-xs font-medium text-white"
                    htmlFor="qualityMenuToggle"
                >
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
