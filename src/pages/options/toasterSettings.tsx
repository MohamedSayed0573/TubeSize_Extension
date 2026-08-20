import type { OptionsMap } from "@app-types/types";
import useOptions from "@hooks/useOptions";
import { cn } from "@lib/cn";
import CONFIG from "@lib/constants";

export default function ToasterSettings({ optionsState }: { optionsState: OptionsMap }) {
    const toasterThreshold = optionsState.toasterThreshold ?? CONFIG.DEFAULT_TOASTER_THRESHOLD;

    const thresholdUnit =
        optionsState.toasterThresholdUnit ?? CONFIG.DEFAULT_TOASTER_THRESHOLD_UNIT;

    const isToasterEnabled = optionsState.toasterEnabled ?? CONFIG.DEFAULT_TOASTER_ENABLED;

    const { updateOptionsMutation } = useOptions();
    const { mutate: updateOptions } = updateOptionsMutation;

    return (
        <div className="p-3.5">
            <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Data Usage Alert
            </div>
            <p className="mb-2 text-xs text-zinc-400">
                Show a warning when internet usage gets too high.
            </p>
            <div
                className={cn(
                    "rounded-md border border-transparent bg-white/4 px-2.5 py-2 transition-colors duration-300",
                    !isToasterEnabled && "bg-white/1 opacity-80",
                )}
            >
                <section className="flex items-center justify-between rounded-md border border-transparent bg-white/4 px-4 py-2 transition-all duration-300 hover:border-white/15 hover:bg-white/8">
                    <label
                        className="cursor-pointer text-xs font-medium text-white"
                        htmlFor="toasterThresholdToggle"
                    >
                        Enable Data Usage Alert
                    </label>
                    <input
                        type="checkbox"
                        id="toasterThresholdToggle"
                        checked={isToasterEnabled}
                        onChange={(event) => {
                            const { checked } = event.target;
                            updateOptions({ toasterEnabled: checked });
                        }}
                    />
                </section>
                <section
                    className={cn(
                        "mt-3 rounded-lg border border-white/5 bg-white/3 p-2.5 transition-all duration-300 ease-in-out hover:border-white/10 hover:bg-white/6",
                        !isToasterEnabled && "bg-white/1 opacity-60",
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
                                updateOptions({
                                    toasterThreshold: value,
                                });
                            }}
                            disabled={!isToasterEnabled}
                        />
                    </div>
                    <div className="flex items-center justify-around gap-6 pt-2.5">
                        <RadioOption
                            id="toasterThresholdType1"
                            name="toasterThresholdType"
                            value="mbPerHour"
                            checked={thresholdUnit === "mbPerHour"}
                            disabled={!isToasterEnabled}
                            onChange={() => {
                                updateOptions({
                                    toasterThresholdUnit: "mbPerHour",
                                });
                            }}
                        >
                            MB/hour
                        </RadioOption>

                        <RadioOption
                            id="toasterThresholdType2"
                            name="toasterThresholdType"
                            value="mbPerMinute"
                            checked={thresholdUnit === "mbPerMinute"}
                            disabled={!isToasterEnabled}
                            onChange={() => {
                                updateOptions({
                                    toasterThresholdUnit: "mbPerMinute",
                                });
                            }}
                        >
                            MB/minute
                        </RadioOption>
                    </div>
                </section>
            </div>
        </div>
    );
}

interface RadioOptionProps {
    id: string;
    name: string;
    value: string;
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
    children: React.ReactNode;
}

function RadioOption({
    id,
    name,
    value,
    checked,
    disabled = false,
    onChange,
    children,
}: RadioOptionProps) {
    return (
        <label
            htmlFor={id}
            className={cn(
                "flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-300",
                disabled && "cursor-not-allowed text-zinc-500",
            )}
        >
            <input
                type="radio"
                id={id}
                name={name}
                value={value}
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                className="cursor-pointer accent-sky-400"
            />
            {children}
        </label>
    );
}
