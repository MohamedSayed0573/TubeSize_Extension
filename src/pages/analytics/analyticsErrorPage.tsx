import AnalyticsBanner from "@pages/analytics/components/analyticsBanner";

export default function AnalyticsErrorPage({ error }: { error: unknown }) {
    const routeError = error;
    const message = routeError instanceof Error ? routeError.message : String(routeError);
    return (
        <>
            <AnalyticsBanner />
            <div className="flex flex-1 items-center justify-center bg-neutral-950 p-8">
                <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed border-red-900 bg-[#221718] px-10 py-8 text-center font-mono">
                    <span className="text-2xl text-red-400">⚠</span>
                    <span className="text-base text-stone-200">Something went wrong</span>
                    <span className="text-xs text-neutral-500">
                        Failed to load your usage data.
                    </span>
                    <div className="rounded border-l-3 border-red-400 bg-red-400/12 p-3 text-left text-xs text-rose-400">
                        {message}
                    </div>
                </div>
            </div>
        </>
    );
}
