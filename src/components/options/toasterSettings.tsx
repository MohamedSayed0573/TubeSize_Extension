import { getFromSyncCache, setToSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";
import { useEffect, useState } from "react";
import clsx from "clsx";

export default function ToasterSettings() {
    const [toasterThreshold, setToasterThreshold] = useState<number>(
        CONFIG.DEFAULT_TOASTER_THRESHOLD,
    );
    const [thresholdUnit, setThresholdUnit] = useState<"mbPerMinute" | "mbPerHour">(
        CONFIG.DEFAULT_TOASTER_THRESHOLD_UNIT,
    );

    const [toasterEnabled, setToasterEnabled] = useState<boolean>(CONFIG.DEFAULT_TOASTER_ENABLED);
    useEffect(() => {
        void (async () => {
            const toasterThreshold =
                (await getFromSyncCache("toasterThreshold")) ?? CONFIG.DEFAULT_TOASTER_THRESHOLD;
            const toasterThresholdUnit =
                ((await getFromSyncCache("toasterThresholdUnit")) as
                    | "mbPerMinute"
                    | "mbPerHour"
                    | undefined) ?? CONFIG.DEFAULT_TOASTER_THRESHOLD_UNIT;

            if (typeof toasterThreshold === "number") {
                setToasterThreshold(toasterThreshold);
            }
            setThresholdUnit(toasterThresholdUnit);
        })();
    }, []);

    useEffect(() => {
        void (async () => {
            const isToasterEnabled =
                (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
            if (typeof isToasterEnabled === "boolean") {
                setToasterEnabled(isToasterEnabled);
            }
        })();
    }, []);

    return (
        <div className="p-3.5">
            <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Data Usage Alert
            </div>
            <div className="mb-2 text-xs text-zinc-400">
                Show a warning when internet usage gets too high.
            </div>
            <div
                className={clsx(
                    "rounded-md border border-transparent bg-white/4 px-2.5 py-2 transition-colors duration-300",
                    !toasterEnabled && "bg-white/1 opacity-80",
                )}
            >
                <div className="flex items-center justify-between rounded-md border border-transparent bg-white/4 px-4 py-2 transition-all duration-300 hover:border-white/15 hover:bg-white/8">
                    <label
                        className="cursor-pointer text-xs font-medium text-white"
                        htmlFor="toasterThresholdToggle"
                    >
                        Enable Data Usage Alert
                    </label>
                    <input
                        type="checkbox"
                        id="toasterThresholdToggle"
                        checked={toasterEnabled}
                        onChange={(event) => {
                            const { checked } = event.target;
                            void setToSyncCache({
                                toasterEnabled: checked,
                            }).then(() => setToasterEnabled(checked));
                        }}
                    />
                </div>
                <div
                    className={clsx(
                        "mt-3 rounded-lg border border-white/5 bg-white/3 p-2.5 transition-all duration-300 ease-in-out hover:border-white/10 hover:bg-white/6",
                        !toasterEnabled && "bg-white/1 opacity-60",
                    )}
                >
                    <div className="flex items-center gap-2.5">
                        <label
                            className="text-xs font-medium whitespace-nowrap text-zinc-100"
                            htmlFor="toasterThreshold"
                        >
                            Usage Limit
                        </label>
                        <input
                            type="number"
                            className="w-36 rounded-md border border-white/15 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                            min="1"
                            id="toasterThreshold"
                            value={toasterThreshold}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (value < 1 || value > 10_000 || Number.isNaN(value)) return;
                                void setToSyncCache({
                                    toasterThreshold: value,
                                }).then(() => setToasterThreshold(value));
                            }}
                            disabled={!toasterEnabled}
                        />
                    </div>
                    <div className="flex items-center justify-around pt-2.5">
                        <input
                            type="radio"
                            id="toasterThresholdType1"
                            name="toasterThresholdType"
                            value="mbPerHour"
                            onChange={() => {
                                void setToSyncCache({
                                    toasterThresholdUnit: "mbPerHour",
                                }).then(() => setThresholdUnit("mbPerHour"));
                            }}
                            checked={thresholdUnit === "mbPerHour"}
                            disabled={!toasterEnabled}
                        />
                        <label
                            htmlFor="toasterThresholdType1"
                            className="cursor-pointer text-xs font-medium text-zinc-300"
                        >
                            MB/hour
                        </label>
                        <input
                            type="radio"
                            id="toasterThresholdType2"
                            name="toasterThresholdType"
                            value="mbPerMinute"
                            onChange={() => {
                                void setToSyncCache({
                                    toasterThresholdUnit: "mbPerMinute",
                                }).then(() => setThresholdUnit("mbPerMinute"));
                            }}
                            checked={thresholdUnit === "mbPerMinute"}
                            disabled={!toasterEnabled}
                        />
                        <label
                            htmlFor="toasterThresholdType2"
                            className="cursor-pointer text-xs font-medium text-zinc-300"
                        >
                            MB/minute
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
