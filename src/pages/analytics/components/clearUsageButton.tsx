import useUsage from "@hooks/useUsage";

export default function ClearUsageButton() {
    const { clearUsageMutation } = useUsage();
    const {
        mutate: clearUsage,
        isPending: isClearingPending,
        isError: isClearingError,
        isSuccess: isClearingSuccess,
        reset: resetClearing,
        isIdle: isClearingIdle,
    } = clearUsageMutation;

    return (
        <button
            className="mt-2.5 cursor-pointer rounded-xl border border-neutral-800 bg-[#221718] px-3 py-2.5 font-mono text-xs font-semibold tracking-widest text-red-400 uppercase transition-colors hover:bg-[#2a1b1c]"
            onClick={() => {
                clearUsage();

                setTimeout(() => {
                    resetClearing();
                }, 2500);
            }}
            disabled={isClearingPending}
        >
            {isClearingPending && "Clearing"}
            {isClearingError && "Failed To Clear Usage Data. Try Again."}
            {isClearingSuccess && "Usage Data was Cleared Successfully"}
            {isClearingIdle && "Clear All Usage Data"}
        </button>
    );
}
