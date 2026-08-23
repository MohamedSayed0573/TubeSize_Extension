export default function NoUsageData() {
    return (
        <>
            <div className="flex flex-1 items-center justify-center bg-neutral-950 p-8">
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 px-10 py-8 font-mono text-teal-400">
                    <img
                        className="h-10 w-10 opacity-60"
                        src="/icons/icon-32.png"
                        alt="Analytics Icon"
                    />
                    <span className="text-base">No usage data available.</span>
                    <span className="text-xs text-neutral-500">
                        Watch a YouTube video to start tracking your usage statistics.
                    </span>
                </div>
            </div>
        </>
    );
}
