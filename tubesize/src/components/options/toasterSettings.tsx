import "@styles/toasterOptions.css";
import { getFromSyncCache, setToSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";
import { useEffect, useState } from "react";

export default function ToasterSettings() {
    const [toasterThreshold, setToasterThreshold] = useState<number>(
        CONFIG.DEFAULT_TOASTER_THRESHOLD,
    );
    const [thresholdUnit, setThresholdUnit] = useState<"mbPerMinute" | "mbPerHour">(
        CONFIG.DEFAULT_TOASTER_THRESHOLD_UNIT,
    );

    const [toasterEnabled, setToasterEnabled] = useState<boolean>(false);
    useEffect(() => {
        (async () => {
            try {
                const toasterThreshold = (await getFromSyncCache("toasterThreshold")) as number;
                const toasterThresholdUnit = (await getFromSyncCache("toasterThresholdUnit")) as
                    | "mbPerMinute"
                    | "mbPerHour";

                if (typeof toasterThreshold === "number") {
                    setToasterThreshold(toasterThreshold);
                }

                if (toasterThresholdUnit) {
                    setThresholdUnit(toasterThresholdUnit);
                }
            } catch {}
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const toasterEnabled =
                    (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
                console.log("Fetched toasterEnabled from cache:", toasterEnabled);
                if (typeof toasterEnabled === "boolean") {
                    setToasterEnabled(toasterEnabled);
                }
            } catch {}
        })();
    }, []);

    return (
        <div className="container">
            <div className="section-title">Data Usage Alert</div>
            <div className="description">Show a warning when internet usage gets too high.</div>
            <div
                className={`toaster-settings-box${toasterEnabled ? "" : " toaster-settings-box-disabled"}`}
            >
                <div className="setting-toggle-row toaster-toggle-row">
                    <label className="option-label" htmlFor="toasterThresholdToggle">
                        Enable Data Usage Alert
                    </label>
                    <input
                        type="checkbox"
                        id="toasterThresholdToggle"
                        checked={toasterEnabled}
                        onChange={async (event) => {
                            const { checked } = event.target as HTMLInputElement;
                            setToasterEnabled(checked);
                            await setToSyncCache({
                                toasterEnabled: checked,
                            });
                        }}
                    />
                </div>
                <div
                    className={`toaster-threshold${toasterEnabled ? "" : " toaster-threshold-disabled"}`}
                >
                    <div className="toaster-input">
                        <label className="toaster-threshold-label" htmlFor="toasterThreshold">
                            Usage Limit
                        </label>
                        <input
                            type="number"
                            className="toaster-threshold-input"
                            min="1"
                            id="toasterThreshold"
                            value={toasterThreshold}
                            onChange={async (event) => {
                                try {
                                    const value = parseInt(event.target.value);
                                    if (value < 1 || value > 10000 || isNaN(value)) return;
                                    setToasterThreshold(value);
                                    await setToSyncCache({
                                        toasterThreshold: value,
                                    });
                                } catch {}
                            }}
                            disabled={!toasterEnabled}
                        />
                    </div>
                    <div className="toaster-threshold-types">
                        <input
                            type="radio"
                            id="toasterThresholdType1"
                            name="toasterThresholdType"
                            value="mbPerHour"
                            onChange={() => {
                                setThresholdUnit("mbPerHour");
                                setToSyncCache({
                                    toasterThresholdUnit: "mbPerHour",
                                });
                            }}
                            checked={thresholdUnit === "mbPerHour"}
                            disabled={!toasterEnabled}
                        />
                        <label
                            htmlFor="toasterThresholdType1"
                            className="toaster-threshold-radio-label"
                        >
                            MB/hour
                        </label>
                        <input
                            type="radio"
                            id="toasterThresholdType2"
                            name="toasterThresholdType"
                            value="mbPerMinute"
                            onChange={() => {
                                setThresholdUnit("mbPerMinute");
                                setToSyncCache({
                                    toasterThresholdUnit: "mbPerMinute",
                                });
                            }}
                            checked={thresholdUnit === "mbPerMinute"}
                            disabled={!toasterEnabled}
                        />
                        <label
                            htmlFor="toasterThresholdType2"
                            className="toaster-threshold-radio-label"
                        >
                            MB/minute
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
