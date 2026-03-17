import { useEffect, useState } from "react";
import { getFromSyncCache, setToSyncCache } from "../../cache";

export default function ApiFallbackSetting() {
    const [apiFallback, setAPIFallback] = useState(false);

    useEffect(() => {
        (async () => {
            const options = await getFromSyncCache();
            setAPIFallback(!!options.apiFallback);
        })();
    }, []);
    return (
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
                        Uses our backup server when local extraction fails. It can be slower. See
                        <a
                            className="info-tooltip-link"
                            href="https://github.com/MohamedSayed0573/TubeSize_Extension/blob/main/PRIVACY.md"
                            target="_blank"
                        >
                            our privacy policy
                        </a>
                        for more details.
                    </div>
                </div>
            </div>
        </div>
    );
}
