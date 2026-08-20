import useOptions from "@hooks/useOptions";
import CONFIG from "@lib/constants";
import type { OptionsMap } from "@app-types/types";

const stateStyles = {
    idle: "border-red-500/20 bg-red-500/8 text-red-400 hover:border-red-500/40 hover:bg-red-500/18",
    success: "border-green-500/40 bg-green-500/8 text-green-500",
    error: "border-red-500/20 bg-red-500/8 text-red-400",
    pending: "",
} as const;

export default function CacheSettings({ optionsState }: { optionsState: OptionsMap }) {
    const { updateOptionsMutation } = useOptions();
    const { mutate: updateOptions } = updateOptionsMutation;
    const { clearCacheMutation } = useOptions();
    const {
        mutate: clearLocalCache,
        isPending: clearingIsPending,
        isSuccess: clearingIsSuccess,
        isError: clearingIsError,
        status: clearingStatus,
        isIdle: clearingIsIdle,
        reset: resetClearingStatus,
    } = clearCacheMutation;

    return (
        <div className="p-3">
            <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Cache
            </div>
            <div className="mb-2 flex items-center justify-between rounded-md border border-transparent bg-white/4 p-2">
                <span className="text-xs font-medium">Duration</span>
                <select
                    id="cacheTTL"
                    className="cursor-pointer rounded border border-white/15 bg-zinc-800 p-1 outline-none focus:border-sky-400"
                    value={
                        CONFIG.ttlInSecondsToDays[optionsState.cacheTTL ?? CONFIG.DEFAULT_CACHE_TTL]
                    }
                    onChange={(event) => {
                        const days = event.target.value as keyof typeof CONFIG.ttlInSecondsOptions;
                        updateOptions({ cacheTTL: CONFIG.ttlInSecondsOptions[days] });
                    }}
                >
                    {Object.keys(CONFIG.ttlInSecondsOptions).map((days) => (
                        <option key={days} value={days}>
                            {days} Day{days === "1" ? "" : "s"}
                        </option>
                    ))}
                </select>
            </div>
            <button
                id="resetCache"
                className={`w-full cursor-pointer rounded-md border px-2.5 py-2 text-center text-xs font-medium transition-all disabled:cursor-default ${stateStyles[clearingStatus]}`}
                disabled={clearingIsPending}
                onClick={() => {
                    clearLocalCache();
                    setTimeout(resetClearingStatus, 3000);
                }}
            >
                {clearingIsIdle && "Clear Cache"}
                {clearingIsPending && "Clearing the Cache..."}
                {clearingIsSuccess && "Cache Cleared Successfully"}
                {clearingIsError && "Failed to Clear Cache"}
            </button>
        </div>
    );
}
