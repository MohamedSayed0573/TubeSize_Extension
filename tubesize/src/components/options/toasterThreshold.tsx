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
                // eslint-disable-next-line no-empty
            } catch {}
        })();
    }, []);
    return (
        <div className="container">
            <div className="section-title">Toaster Threshold</div>
            <div className="description">
                Set the data usage threshold for showing the warning toaster.
            </div>
            <div className="toaster-threshold-row">
                <div className="toaster-input">
                    <span className="toaster-threshold-label">Threshold</span>
                    <input
                        type="number"
                        className="toaster-threshold-input"
                        min="1"
                        value={toasterThreshold}
                        onChange={async (event) => {
                            try {
                                const value = parseInt(event.target.value);
                                if (value < 1 || value > 10000 || isNaN(value)) return;
                                setToasterThreshold(value);
                                await setToSyncCache({
                                    toasterThreshold: value,
                                });
                                // eslint-disable-next-line no-empty
                            } catch {}
                        }}
                    />
                </div>
                <div className="toaster-threshold-types">
                    <input
                        type="radio"
                        id="toasterThresholdType1"
                        name="toasterThresholdType"
                        value="mbPerHour"
                        className="toaster-threshold-radio"
                        onChange={() => {
                            setThresholdUnit("mbPerHour");
                            setToSyncCache({
                                toasterThresholdUnit: "mbPerHour",
                            });
                        }}
                        checked={thresholdUnit === "mbPerHour"}
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
                        className="toaster-threshold-radio"
                        onChange={() => {
                            setThresholdUnit("mbPerMinute");
                            setToSyncCache({
                                toasterThresholdUnit: "mbPerMinute",
                            });
                        }}
                        checked={thresholdUnit === "mbPerMinute"}
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
    );
}
